/** Choose what the source preview sits on, from what the mark is painted with. */

import type { Hex } from '../pipeline/index.ts'
import { isDarkColor } from '../shared/color.ts'

/** The Ground the app is built on, and a white stand-in for a dark mark. */
export const BACKDROPS = ['ground', 'light'] as const
export type Backdrop = (typeof BACKDROPS)[number]

/**
 * A Source Mark arrives with unknown paint on transparency, and a black one is
 * invisible on the Ground. Two answers, in order of directness:
 *
 *   markPaint       the mark's own color, when it has exactly one
 *   iconBackground  inference's answer to the same question, which it reaches
 *                   by contrast — a light one means it measured a dark mark
 *
 * Transparency is not a color, so neither reads the pixels behind the mark.
 */
export function sourceBackdrop(markPaint: Hex | null, iconBackground: Hex | null): Backdrop {
  if (markPaint !== null) {
    return isDarkColor(markPaint) ? 'light' : 'ground'
  }
  if (iconBackground !== null) {
    return isDarkColor(iconBackground) ? 'ground' : 'light'
  }
  return 'ground'
}
