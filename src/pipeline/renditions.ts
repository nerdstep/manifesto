import type { Hex, RenditionSpec, Treatment } from './types.ts'

export const CANONICAL_SIZE = 1000

export const PROBE_SIZE = 1024

export const SAFE_ZONE_DIAMETER = 0.8

export const WORDMARK_ASPECT_THRESHOLD = 2

export const ICO_MEMBER_SIZES = [16, 32, 48] as const

export const ICO_MEMBERS: RenditionSpec[] = ICO_MEMBER_SIZES.map((size) => ({
  filename: null,
  treatment: { size, background: null, fit: { mode: 'box', inset: 0 } },
}))

export const PNG_RENDITIONS: RenditionSpec[] = [
  {
    filename: 'apple-touch-icon.png',
    // iOS supplies its own rounded-rectangle mask.
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
    // Fit painted pixels to Android's circular safe zone.
    treatment: {
      size: 512,
      background: 'iconBackground',
      fit: { mode: 'circle', diameter: SAFE_ZONE_DIAMETER },
    },
    manifestPurpose: 'maskable',
  },
]

/**
 * The surface a Rendition composes against. Recolored marks assume their own
 * surface, so `opaque` makes every Rendition opaque, not just the two that
 * platform behavior already forces (ADR 0003).
 */
export function renditionBackground(
  treatment: Treatment,
  iconBackground: Hex,
  opaque: boolean,
): Hex | null {
  return opaque || treatment.background !== null ? iconBackground : null
}

export const FAVICON_SVG_TREATMENT: RenditionSpec['treatment'] = {
  size: CANONICAL_SIZE,
  background: null,
  fit: { mode: 'box', inset: 0 },
}

export {
  BUNDLE_FILENAMES,
  FAVICON_DARK_CLASS,
  FAVICON_LIGHT_CLASS,
  SINGLE_SCHEME_FILENAMES,
} from '../shared/bundle.ts'
