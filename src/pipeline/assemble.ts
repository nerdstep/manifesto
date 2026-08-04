import icoEndec from 'ico-endec'
import { optimize as runSvgo } from 'svgo/browser'

import { FAVICON_DARK_CLASS, FAVICON_LIGHT_CLASS } from '../shared/bundle.ts'
import { canvas, composeInner } from './compose.ts'
import type { NormalizedMark } from './normalize.ts'
import { FAVICON_SVG_TREATMENT, PNG_RENDITIONS } from './renditions.ts'
import type { ManifestSettings } from './types.ts'

const LIGHT_CLASS = FAVICON_LIGHT_CLASS
const DARK_CLASS = FAVICON_DARK_CLASS

const LIGHT_PREFIX = 'lm'
const DARK_PREFIX = 'dm'

export function packIco(pngs: Uint8Array[]): Uint8Array {
  if (pngs.length === 0) {
    throw new Error('packIco() needs at least one image')
  }
  return new Uint8Array(icoEndec.encode(pngs.map((png) => Buffer.from(png))))
}

/** Prevent id and class collisions between light and dark marks. */
function namespaceIds(svg: string, prefix: string): string {
  return runSvgo(svg, {
    plugins: [{ name: 'prefixIds', params: { prefix, delim: '-', prefixClassNames: true } }],
    js2svg: { pretty: false },
  }).data
}

export function buildFaviconSvg(source: NormalizedMark, dark: NormalizedMark | null): string {
  if (dark === null) {
    return canvas(composeInner(source, FAVICON_SVG_TREATMENT), null)
  }

  const light = namespaceIds(composeInner(source, FAVICON_SVG_TREATMENT), LIGHT_PREFIX)
  const night = namespaceIds(composeInner(dark, FAVICON_SVG_TREATMENT), DARK_PREFIX)

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

export { HEAD_SNIPPET } from '../shared/bundle.ts'
