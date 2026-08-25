/** Resolve which marks and backgrounds a Bundle renders with (ADR 0003). */

import { isNil } from 'es-toolkit'

import { monochromePaint, recolor } from './recolor.ts'

export { monochromePaint, recolor } from './recolor.ts'
import type { ColorPair, Hex, RenderSettings, Scheme } from './types.ts'

/** Inference's light-scheme surface, matching a Bundle with no Color Pair. */
const INFERRED_SURFACE: Hex = '#FFFFFF'

export type ResolvedScheme = {
  /** The light-scheme mark; also the Source Mark when recolor is off. */
  light: string
  /** The dark-scheme mark: supplied, derived, or absent. */
  dark: string | null
  /** Set to the Primary Scheme's surface when recolor is active. */
  iconBackground: Hex
  /** Which mark the rasters and `favicon.ico` use. */
  primary: Scheme
  /**
   * Recolored marks are only legible against their own surface, so every
   * raster and the ICO become opaque rather than transparent.
   */
  opaque: boolean
  /** Whether `dark` was recolored here rather than supplied by the user. */
  derived: boolean
}

/**
 * Recolor is available only to a monochrome Source Mark with no Dark Mark
 * supplied: supplied always beats derived, matching Sidecar-over-Inference.
 */
export function canRecolor(sourceSvg: string, darkSvg: string | null): boolean {
  return darkSvg === null && monochromePaint(sourceSvg) !== null
}

/**
 * Inference's opening guess for a monochrome mark: the light scheme reproduces
 * what the Bundle already produces, so switching recolor on changes nothing
 * until a color is edited. Null when the mark is not eligible.
 */
export function inferColorPair(sourceSvg: string): ColorPair | null {
  const paint = monochromePaint(sourceSvg)
  if (paint === null) {
    return null
  }
  return { mark: INFERRED_SURFACE, surface: `#${paint.slice(1).toUpperCase()}` }
}

export function resolveScheme(
  sourceSvg: string,
  darkSvg: string | null,
  settings: RenderSettings,
): ResolvedScheme {
  const off: ResolvedScheme = {
    light: sourceSvg,
    dark: darkSvg,
    iconBackground: settings.iconBackground,
    primary: 'light',
    opaque: false,
    derived: false,
  }

  const pair = settings.colorPair
  if (isNil(pair) || !canRecolor(sourceSvg, darkSvg)) {
    return off
  }

  const primary = settings.primaryScheme ?? 'light'

  // Dark paints the mark in `mark` on `surface`; light is the swap.
  return {
    light: recolor(sourceSvg, pair.surface),
    dark: recolor(sourceSvg, pair.mark),
    iconBackground: primary === 'dark' ? pair.surface : pair.mark,
    primary,
    opaque: true,
    derived: true,
  }
}
