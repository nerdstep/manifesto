/**
 * Build the wrapper SVG for one Rendition.
 *
 * Pure string work — no rasterization — so it is unit testable on its own.
 *
 * Every Treatment is applied in VECTOR space: a canonical `viewBox="0 0 1000 1000"`
 * canvas, an optional background `<rect>`, and a transform placing the Normalized mark
 * inside the inset box. Each Rendition is then rasterized from its own wrapper at final
 * size — nothing is downsampled from a master raster. Invisible at 512, decisive at 16,
 * where downsampling turns a glyph to grey mush.
 */

import { isDarkColor } from '../shared/color.ts'
import type { NormalizedMark } from './normalize.ts'
import { CANONICAL_SIZE } from './renditions.ts'
import type { Hex, Treatment } from './types.ts'

/** Trim float noise so composed documents are readable and stable. */
function n(value: number): string {
  return Number(value.toFixed(4)).toString()
}

/**
 * Luminance lives in `src/shared/` so the previews can use the same threshold.
 *
 * A preview that decided "dark background" differently from `markFor()` below would draw
 * the light mark next to bytes containing the dark one.
 */
export { luminanceOf, relativeLuminance } from '../shared/color.ts'

/**
 * Whether a background is dark enough to warrant the Dark Mark.
 *
 * Typed to `Hex` here because that is what a Treatment carries; the shared form takes any
 * string, since the webview holds colours it has not yet validated.
 */
export function isDark(hex: Hex): boolean {
  return isDarkColor(hex)
}

/**
 * Choose which mark to compose.
 *
 * A Dark Mark is authored for dark surfaces, so it belongs anywhere the Icon Background
 * is dark — not only in `favicon.svg`. Without this, `apple-touch-icon` composes the
 * light mark onto a dark background while the mark designed for that exact situation
 * sits unused.
 */
export function markFor(
  source: NormalizedMark,
  dark: NormalizedMark | null,
  background: Hex | null,
): NormalizedMark {
  if (dark === null || background === null) return source
  return isDark(background) ? dark : source
}

/**
 * @param background `null` means transparent — legal only where the platform allows it.
 */
/**
 * How much to scale the mark so it satisfies the Treatment's fit.
 *
 * `circle` divides the safe radius by the mark's own furthest painted pixel, so the
 * result depends on the mark's shape: a round mark keeps full size, a mark that paints
 * into its bounding-box corners shrinks exactly as much as it must.
 */
export function scaleFor(mark: NormalizedMark, fit: Treatment['fit']): number {
  if (fit.mode === 'circle') {
    return (CANONICAL_SIZE * fit.diameter) / 2 / mark.maxRadius
  }
  return (CANONICAL_SIZE * (1 - 2 * fit.inset)) / Math.max(mark.extent.w, mark.extent.h)
}

/**
 * The placed mark, without a canvas around it.
 *
 * Exposed so `favicon.svg` is built from the same geometry as the rasterized
 * Renditions rather than reimplementing it. Without that, a padded export would give a
 * full-bleed `.ico` and a tiny `.svg`, and the favicon would visibly change depending
 * on which one a browser picked.
 */
export function composeInner(mark: NormalizedMark, treatment: Treatment): string {
  const { extent } = mark
  const scale = scaleFor(mark, treatment.fit)

  // Centre the painted extents on the canvas. Both fits centre the same way; they
  // differ only in how much they scale.
  const tx = CANONICAL_SIZE / 2 - (extent.x + extent.w / 2) * scale
  const ty = CANONICAL_SIZE / 2 - (extent.y + extent.h / 2) * scale

  return `<g transform="translate(${n(tx)} ${n(ty)}) scale(${n(scale)})">${mark.nestable}</g>`
}

/** The canonical canvas an Asset Bundle's documents are composed on. */
export function canvas(body: string, background: Hex | null): string {
  const backdrop =
    background === null
      ? ''
      : `<rect width="${CANONICAL_SIZE}" height="${CANONICAL_SIZE}" fill="${background}"/>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANONICAL_SIZE} ${CANONICAL_SIZE}">` +
    backdrop +
    body +
    `</svg>`
  )
}

/**
 * @param background `null` means transparent — legal only where the platform allows it.
 */
export function compose(
  mark: NormalizedMark,
  treatment: Treatment,
  background: Hex | null,
): string {
  return canvas(composeInner(mark, treatment), background)
}
