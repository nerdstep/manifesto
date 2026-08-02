/**
 * Colour maths the pipeline and the webview both need.
 *
 * **This file must never import anything**, for the same reason as `bundle.ts`: the
 * webview needs it, and reaching into the pipeline for it drags `svgo`, `ico-endec` and
 * `node:crypto` into the browser bundle.
 *
 * Sharing it rather than copying it matters more here than it looks. The previews decide
 * whether to draw text black or white over a user-chosen background, and the pipeline
 * decides whether an Icon Background is dark enough to warrant the Dark Mark. If those two
 * used different thresholds — or different gamma — a mark could be composed for a dark
 * background while the preview drew it as light, and the preview would be lying about the
 * bytes sitting next to it.
 */

/** One channel, 0–255, linearised out of sRGB's transfer curve. */
function linearise(value: number): number {
  const srgb = value / 255
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

/**
 * Perceived lightness of an 8-bit RGB triple, 0–1.
 *
 * The channel-level form exists because inference measures luminance from pixels, where
 * there is no hex string to parse.
 */
export function luminanceOf(red: number, green: number, blue: number): number {
  return 0.2126 * linearise(red) + 0.7152 * linearise(green) + 0.0722 * linearise(blue)
}

/** Perceived lightness of a hex colour, 0–1, using the sRGB relative luminance formula. */
export function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '')
  // Expand `abc` to `aabbcc`. Deliberately not spreading the string: that yields code
  // points, which splits anything non-ASCII into pieces.
  const full =
    value.length === 3 ? value.replaceAll(/(.)/gu, '$1$1') : value.padEnd(6, '0').slice(0, 6)

  const channel = (offset: number): number => Number.parseInt(full.slice(offset, offset + 2), 16)

  return luminanceOf(channel(0), channel(2), channel(4))
}

/**
 * Whether a background is dark enough to need light content on it.
 *
 * One threshold for the whole app: the pipeline uses it to choose the Dark Mark, the
 * previews use it to choose text colour. They must agree or the preview misrepresents the
 * file beside it.
 */
export function isDarkColor(hex: string): boolean {
  return relativeLuminance(hex) < 0.5
}
