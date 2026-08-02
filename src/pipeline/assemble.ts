/**
 * Turn rendered bytes and settings into the files an Asset Bundle contains.
 *
 * `favicon.ico` — 16/32/48 PNGs packed by `ico-endec`, which passes buffers through
 * unmodified and so yields a PNG-embedded ICO (verified in Phase 0).
 *
 * `favicon.svg` — the Normalized mark on the canonical canvas, using the same geometry
 * as every other Rendition. If a Dark Mark exists, both are embedded and toggled by
 * `prefers-color-scheme`.
 *
 * `site.webmanifest` — generated from the Rendition table, so it cannot drift.
 */

import icoEndec from 'ico-endec'
import { optimize as runSvgo } from 'svgo/browser'

import { FAVICON_DARK_CLASS, FAVICON_LIGHT_CLASS } from '../shared/bundle.ts'
import { canvas, composeInner } from './compose.ts'
import type { NormalizedMark } from './normalize.ts'
import { FAVICON_SVG_TREATMENT, PNG_RENDITIONS } from './renditions.ts'
import type { ManifestSettings } from './types.ts'

/**
 * Class names on the two embedded marks.
 *
 * Defined in `src/shared/` because the browser-tab preview overrides them to force one
 * half visible — see the note there. Distinct from the id prefixes below, so the toggle
 * rules cannot match content inside either mark.
 */
const LIGHT_CLASS = FAVICON_LIGHT_CLASS
const DARK_CLASS = FAVICON_DARK_CLASS

/** Id/class prefixes applied to each embedded mark. See `embed()`. */
const LIGHT_PREFIX = 'lm'
const DARK_PREFIX = 'dm'

/**
 * Pack PNGs into an ICO container.
 *
 * Modern ICO embeds PNG streams directly, which is what every browser we care about
 * reads, and what `ico-endec` produces when handed PNGs.
 */
export function packIco(pngs: Uint8Array[]): Uint8Array {
  if (pngs.length === 0) throw new Error('packIco() needs at least one image')
  return new Uint8Array(icoEndec.encode(pngs.map((png) => Buffer.from(png))))
}

/**
 * Namespace a mark's ids and class names.
 *
 * Two marks in one document share an id space. If both were exported from Figma they
 * may well both contain `<linearGradient id="paint0_linear">` — and the duplicate is
 * ignored, so BOTH marks silently render with the first one's gradient. Nothing errors;
 * the icon is just quietly wrong in dark mode.
 */
function namespaceIds(svg: string, prefix: string): string {
  return runSvgo(svg, {
    plugins: [{ name: 'prefixIds', params: { prefix, delim: '-', prefixClassNames: true } }],
    js2svg: { pretty: false },
  }).data
}

/**
 * `favicon.svg` — the one Rendition that stays vector.
 *
 * Chrome, Firefox and Edge honour `prefers-color-scheme` inside an SVG favicon and swap
 * it live when the OS theme changes. Safari renders the default state regardless, which
 * is why the light mark is the default: this is an enhancement, never a licence to ship
 * an unreadable light-mode icon.
 */
export function buildFaviconSvg(source: NormalizedMark, dark: NormalizedMark | null): string {
  if (dark === null) return canvas(composeInner(source, FAVICON_SVG_TREATMENT), null)

  const light = namespaceIds(composeInner(source, FAVICON_SVG_TREATMENT), LIGHT_PREFIX)
  const night = namespaceIds(composeInner(dark, FAVICON_SVG_TREATMENT), DARK_PREFIX)

  // `display:inline` rather than `block`: inline is the initial value for <g>, so this
  // restores the default rather than imposing a different one.
  const style =
    `<style>.${DARK_CLASS}{display:none}` +
    `@media(prefers-color-scheme:dark){` +
    `.${LIGHT_CLASS}{display:none}.${DARK_CLASS}{display:inline}}` +
    `</style>`

  return canvas(
    `${style}<g class="${LIGHT_CLASS}">${light}</g><g class="${DARK_CLASS}">${night}</g>`,
    null,
  )
}

/**
 * `site.webmanifest`.
 *
 * `display`, `start_url`, `scope` and `id` are hardcoded: this is an icon generator, not
 * a PWA configurator. Anyone needing `display: "fullscreen"` can edit one line.
 *
 * Emitting a manifest does not make a static site nag users to install it — Chrome's
 * install criteria also require a service worker with a fetch handler. `theme_color` is
 * the one field that takes effect immediately, tinting Android Chrome's address bar.
 */
export function buildWebManifest(settings: ManifestSettings): string {
  const icons = PNG_RENDITIONS.filter((r) => r.manifestPurpose !== undefined).map((r) => ({
    src: `/${r.filename ?? ''}`,
    sizes: `${r.treatment.size}x${r.treatment.size}`,
    type: 'image/png',
    purpose: r.manifestPurpose,
  }))

  return `${JSON.stringify(
    {
      name: settings.name,
      short_name: settings.shortName,
      icons,
      theme_color: settings.themeColor,
      background_color: settings.splashBackground,
      display: 'standalone',
      start_url: '/',
      scope: '/',
      id: '/',
    },
    null,
    2,
  )}\n`
}

/**
 * Re-exported for pipeline consumers. It is defined in `src/shared/` with no imports,
 * because the webview needs it and must not pull the pipeline into the browser.
 */
export { HEAD_SNIPPET } from '../shared/bundle.ts'
