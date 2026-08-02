/**
 * The Modern Minimal Set, and the Treatment each Rendition gets.
 *
 * Most rows here are forced by platform behaviour rather than chosen — see docs/design-v1.md
 * for why each one is what it is. The short version:
 *
 * - `favicon.ico` members are full-bleed because at 16px every pixel is load-bearing.
 * - `apple-touch-icon` MUST be opaque: iOS composites transparency onto black. It gets
 *   its own corner rounding from iOS, so the artwork must not be pre-rounded.
 * - `icon-maskable-512` MUST be opaque and fitted to the Safe Zone CIRCLE, not to a
 *   square inset — see the note on that entry.
 * - The `any` icons stay transparent because that is what `purpose: "any"` means.
 */

import type { RenditionSpec } from './types.ts'

/** Canonical coordinate space every Normalized mark is expressed in. */
export const CANONICAL_SIZE = 1000

/** Resolution of the alpha-scan probe used to measure a mark. */
export const PROBE_SIZE = 1024

/**
 * The centred circle a maskable icon is guaranteed to show, as a fraction of width.
 * Everything outside it may be masked away by the OS.
 */
export const SAFE_ZONE_DIAMETER = 0.8

/** Aspect ratio past which a mark is too elongated to read as a square icon. */
export const WORDMARK_ASPECT_THRESHOLD = 2

/** Sizes packed into `favicon.ico`. Not emitted as standalone files. */
export const ICO_MEMBER_SIZES = [16, 32, 48] as const

export const ICO_MEMBERS: RenditionSpec[] = ICO_MEMBER_SIZES.map((size) => ({
  filename: null,
  treatment: { size, background: null, fit: { mode: 'box', inset: 0 } },
}))

export const PNG_RENDITIONS: RenditionSpec[] = [
  {
    filename: 'apple-touch-icon.png',
    // iOS applies a rounded-rect mask, not a circle, so a box fit is right here.
    treatment: {
      size: 180,
      background: 'iconBackground',
      fit: { mode: 'box', inset: 0.1 },
    },
  },
  {
    filename: 'icon-192.png',
    treatment: { size: 192, background: null, fit: { mode: 'box', inset: 0 } },
    manifestPurpose: 'any',
  },
  {
    filename: 'icon-512.png',
    treatment: { size: 512, background: null, fit: { mode: 'box', inset: 0 } },
    manifestPurpose: 'any',
  },
  {
    filename: 'icon-maskable-512.png',
    // The Safe Zone is a CIRCLE, so fit to the circle. A square inset cannot express
    // this: a box of side 0.6 has a half-diagonal of 0.424, against a safe radius of
    // 0.4 — so any mark that paints into its own bounding-box corners is clipped.
    // Measured on the staircase fixture at inset 0.2: maxRadius 217.1 vs safe 204.8.
    //
    // A fixed inset of 0.2172 would also be safe, but it shrinks every maskable icon
    // by 5.7% including round marks that were never at risk. Fitting to the circle is
    // shape-aware: it costs nothing when nothing is at stake.
    treatment: {
      size: 512,
      background: 'iconBackground',
      fit: { mode: 'circle', diameter: SAFE_ZONE_DIAMETER },
    },
    manifestPurpose: 'maskable',
  },
]

/**
 * How `favicon.svg` is placed.
 *
 * Identical to the ICO members: transparent, full bleed. It must match, or a padded
 * export produces a full-bleed `.ico` and a tiny `.svg`, and the favicon changes
 * depending on which one the browser chose. `size` is nominal — SVG is not rasterized.
 */
export const FAVICON_SVG_TREATMENT: RenditionSpec['treatment'] = {
  size: CANONICAL_SIZE,
  background: null,
  fit: { mode: 'box', inset: 0 },
}

/**
 * Re-exported for pipeline consumers. Defined in `src/shared/` with no imports, because
 * the webview needs it and must not pull the pipeline into the browser.
 */
export { BUNDLE_FILENAMES, FAVICON_DARK_CLASS, FAVICON_LIGHT_CLASS } from '../shared/bundle.ts'
