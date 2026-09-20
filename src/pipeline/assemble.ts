import icoEndec from 'ico-endec'
import { optimize as runSvgo } from 'svgo/browser'

import { FAVICON_DARK_CLASS, FAVICON_LIGHT_CLASS } from '../shared/bundle.ts'
import { backdrop, canvas, composeInner } from './compose.ts'
import type { NormalizedMark } from './normalize.ts'
import { FAVICON_SVG_TREATMENT, PNG_RENDITIONS, renditionFit } from './renditions.ts'
import type { Hex, ManifestSettings } from './types.ts'

const LIGHT_CLASS = FAVICON_LIGHT_CLASS
const DARK_CLASS = FAVICON_DARK_CLASS

const LIGHT_PREFIX = 'lm'
const DARK_PREFIX = 'dm'

/**
 * Bytes per ICO directory entry, and the offset of its `wBitCount` field.
 *
 *   0        6            6+16          6+32
 *   | header | entry 0    | entry 1     | ... | PNG payloads
 *            |^^^^ 16 bytes ^^^^|
 *            width height colors reserved planes bitCount bytes offset
 *              0      1      2       3      4-5     6-7    8-11  12-15
 */
const ICO_HEADER_BYTES = 6
const ICO_ENTRY_BYTES = 16
const ICO_ENTRY_COUNT_OFFSET = 4
const ICO_BIT_COUNT_OFFSET = 6

/** resvg emits 8-bit RGBA, which is 32 bits per pixel, not 8. */
const ICO_BITS_PER_PIXEL = 32

/**
 * `ico-endec` writes the PNG's per-channel depth (8) into `wBitCount`, which is
 * a bits-per-*pixel* field. Consumers that pick a member by declared depth —
 * the Windows shell among them — then read a truecolor icon as 256-color and
 * render it wrong. The payloads are correct; only the directory lies.
 */
function declareTrueColor(ico: Uint8Array): Uint8Array {
  const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength)

  for (let entry = 0; entry < view.getUint16(ICO_ENTRY_COUNT_OFFSET, true); entry += 1) {
    const offset = ICO_HEADER_BYTES + entry * ICO_ENTRY_BYTES + ICO_BIT_COUNT_OFFSET
    view.setUint16(offset, ICO_BITS_PER_PIXEL, true)
  }

  return ico
}

export function packIco(pngs: Uint8Array[]): Uint8Array {
  if (pngs.length === 0) {
    throw new Error('packIco() needs at least one image')
  }
  return declareTrueColor(new Uint8Array(icoEndec.encode(pngs.map((png) => Buffer.from(png)))))
}

/** Prevent id and class collisions between light and dark marks. */
function namespaceIds(svg: string, prefix: string): string {
  return runSvgo(svg, {
    plugins: [{ name: 'prefixIds', params: { prefix, delim: '-', prefixClassNames: true } }],
    js2svg: { pretty: false },
  }).data
}

/** The surface each Derived Mark was painted for, or null when recolor is off. */
export type FaviconSurfaces = { light: Hex; dark: Hex } | null

/**
 * A mark with a surface is the tile, so it stops short of the edge — the same
 * margin the opaque rasters take, for the same reason.
 */
function faviconTreatment(opaque: boolean) {
  return { ...FAVICON_SVG_TREATMENT, fit: renditionFit(FAVICON_SVG_TREATMENT, opaque) }
}

/** One mark on one surface: the single-scheme hand-off files (ADR 0004). */
export function buildSchemeFaviconSvg(
  mark: NormalizedMark,
  surface: Hex | null,
  rounded = false,
): string {
  return canvas(composeInner(mark, faviconTreatment(surface !== null)), surface, rounded)
}

/**
 * Both marks in one file, each shown by `prefers-color-scheme`.
 *
 * A recolored mark brings its own surface into each half. The browser's tab
 * color is not the surface the user picked, and `favicon.ico` is already that
 * tile — leaving this one transparent shows the same site two different icons
 * depending on which format the browser took.
 */
export function buildFaviconSvg(
  source: NormalizedMark,
  dark: NormalizedMark | null,
  surfaces: FaviconSurfaces = null,
  rounded = false,
): string {
  if (dark === null) {
    return buildSchemeFaviconSvg(source, surfaces?.light ?? null, rounded)
  }

  const treatment = faviconTreatment(surfaces !== null)
  const light = namespaceIds(composeInner(source, treatment), LIGHT_PREFIX)
  const night = namespaceIds(composeInner(dark, treatment), DARK_PREFIX)

  const style =
    `<style>.${DARK_CLASS}{display:none}` +
    `@media(prefers-color-scheme:dark){` +
    `.${LIGHT_CLASS}{display:none}.${DARK_CLASS}{display:inline}}` +
    `</style>`

  return canvas(
    style +
      `<g class="${LIGHT_CLASS}">${backdrop(surfaces?.light ?? null, rounded)}${light}</g>` +
      `<g class="${DARK_CLASS}">${backdrop(surfaces?.dark ?? null, rounded)}${night}</g>`,
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
