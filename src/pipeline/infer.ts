/**
 * First guesses at the settings a Source Mark cannot state for itself.
 *
 * Every value here is a starting point the user can overwrite in the panel, so being
 * approximately right beats being cleverly right. Two rules follow from that:
 *
 * - **Never surprise.** A black glyph must not tint someone's address bar green because
 *   of four antialiased pixels. Where the evidence is weak, fall back to neutral.
 * - **Read pixels, never markup.** `fill="currentColor"`, CSS variables, `<use>` into a
 *   symbol with its own palette, gradients — all invisible to a parser and all obvious
 *   in a raster. This module never looks at the source text for colour.
 *
 * Colour inference takes a `PixelBuffer` rather than an SVG string, so it is pure and
 * testable without a rasterizer. `Pipeline.inferSettings()` is the one-call form that
 * renders the probe for you.
 */

import { luminanceOf } from './compose.ts'
import type { PixelBuffer } from './rasterize.ts'
import type { Hex, ManifestSettings, RenderSettings } from './types.ts'

/**
 * Resolution the colour probe is rendered at.
 *
 * Small on purpose. This is a histogram, not a rendition — 64² is 4096 samples, which is
 * far more than enough to find a dominant hue, and it costs about a millisecond.
 */
export const INFERENCE_PROBE_SIZE = 64

/**
 * Filename tokens that describe the file rather than name the thing.
 *
 * Dropped from the inferred Name. `v2`, `v10` and friends are matched by pattern rather
 * than listed.
 */
const NOISE_TOKENS = new Set([
  'logo',
  'icon',
  'mark',
  'favicon',
  'final',
  'copy',
  'export',
  'symbol',
  'glyph',
])

/** Longest Name that is still short enough to double as the Short Name. */
const SHORT_NAME_LIMIT = 12

/** Background chosen for a mark that is dark, and its counterpart. */
const LIGHT_BACKGROUND: Hex = '#FFFFFF'
const DARK_BACKGROUND: Hex = '#111111'

/**
 * A Theme Color of white leaves Chrome's address bar as the user's browser drew it.
 *
 * The right answer whenever the mark has no colour worth borrowing — which is most
 * monochrome logos.
 */
const NEUTRAL_THEME: Hex = '#FFFFFF'

/**
 * Only fully opaque pixels are sampled.
 *
 * Rasterizers differ on whether the RGBA they hand back is premultiplied, and at alpha
 * 200 that is the difference between a colour and a 22%-darker lie. At alpha 255 the two
 * representations are identical, so sampling only those is correct either way — and
 * antialiased edge blends, which are not the mark's colours at all, drop out for free.
 */
const OPAQUE = 255

/** Below this, a colour is grey enough that calling it the brand colour would be a guess. */
const MIN_SATURATION = 0.15

/** Colours this dark or this light are read as ink and paper, not as brand colour. */
const MIN_CHANNEL_MAX = 40
const MAX_CHANNEL_MIN = 215

/**
 * Bucket width for the colour histogram, per channel.
 *
 * Gradients and JPEG-ish artefacts spread one visual colour across hundreds of exact
 * values; without bucketing, the mode of the histogram is noise. 8 gives 32 levels per
 * channel — coarse enough to gather a gradient, fine enough to keep two brand colours
 * apart. The colour reported is the bucket's *mean*, not its centre, so the bucketing
 * does not itself shift the answer.
 */
const BUCKET = 8

export type InferredColors = Pick<RenderSettings, 'iconBackground'> &
  Pick<ManifestSettings, 'themeColor' | 'splashBackground'>

export type InferredNames = Pick<ManifestSettings, 'name' | 'shortName'>

function pair(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()
}

function hex(red: number, green: number, blue: number): Hex {
  return `#${pair(red)}${pair(green)}${pair(blue)}`
}

/**
 * Name and Short Name from the dropped filename.
 *
 * Pure string work, deliberately not using `node:path`: the input is a filename that may
 * have arrived from a webview drop with either separator, and `basename` only knows about
 * the one belonging to the platform it is running on.
 */
export function inferNames(filename: string): InferredNames {
  const stem = (filename.split(/[/\\]/u).pop() ?? filename).replace(/\.[^.]*$/u, '')

  const words = stem.split(/[-_\s]+/u).filter((word) => word.length > 0)
  const meaningful = words.filter(
    (word) => !NOISE_TOKENS.has(word.toLowerCase()) && !/^v\d+$/iu.test(word),
  )

  // If every token was noise, keep them all rather than returning nothing. A visibly odd
  // name in an editable field is better than an empty one.
  const chosen = meaningful.length > 0 ? meaningful : words
  const name = chosen.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')

  return {
    name,
    // The Short Name is what a phone shows under a home-screen icon, so its job is to
    // fit. One word is the honest truncation; chopping mid-word is not. Taken from the
    // formatted Name rather than the raw token, or it arrives lower-cased.
    shortName: name.length <= SHORT_NAME_LIMIT ? name : (name.split(' ')[0] ?? name),
  }
}

type Sample = { red: number; green: number; blue: number }

/** Every fully opaque pixel in the probe. */
function opaqueSamples(probe: PixelBuffer): Sample[] {
  const samples: Sample[] = []

  for (let i = 0; i + 3 < probe.pixels.length; i += 4) {
    if ((probe.pixels[i + 3] ?? 0) < OPAQUE) continue
    samples.push({
      red: probe.pixels[i] ?? 0,
      green: probe.pixels[i + 1] ?? 0,
      blue: probe.pixels[i + 2] ?? 0,
    })
  }

  return samples
}

/** True when a colour carries enough hue to be worth putting in someone's address bar. */
function isBrandable({ red, green, blue }: Sample): boolean {
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)

  if (max < MIN_CHANNEL_MAX) return false
  if (min > MAX_CHANNEL_MIN) return false
  return (max - min) / 255 >= MIN_SATURATION
}

/** The most common saturated colour, or `null` when the mark is essentially monochrome. */
function dominantColor(samples: Sample[]): Hex | null {
  const buckets = new Map<number, { count: number; red: number; green: number; blue: number }>()

  for (const sample of samples) {
    if (!isBrandable(sample)) continue

    const key =
      Math.trunc(sample.red / BUCKET) * 1024 +
      Math.trunc(sample.green / BUCKET) * 32 +
      Math.trunc(sample.blue / BUCKET)

    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 }
    bucket.count += 1
    bucket.red += sample.red
    bucket.green += sample.green
    bucket.blue += sample.blue
    buckets.set(key, bucket)
  }

  let winner: { count: number; red: number; green: number; blue: number } | null = null
  for (const bucket of buckets.values()) {
    if (winner === null || bucket.count > winner.count) winner = bucket
  }

  if (winner === null) return null
  return hex(winner.red / winner.count, winner.green / winner.count, winner.blue / winner.count)
}

/**
 * Icon Background, Theme Color and Splash Background from a rendered probe.
 *
 * The Icon Background is derived by CONTRAST, not by sampling: it exists so a
 * transparent mark stays visible where transparency is illegal, and the colour that does
 * that is the opposite of the mark's own. Sampling would produce a background the mark
 * disappears into.
 *
 * Luminance is averaged per pixel rather than taken from the mean colour: a mark that is
 * half black and half white is mid-toned, but its mean colour is a grey that linearises
 * to 0.22 and would be called dark.
 */
export function inferColors(probe: PixelBuffer): InferredColors {
  const samples = opaqueSamples(probe)

  // No fully opaque pixel anywhere — a wholly translucent mark. There is nothing to
  // measure, so say so with neutral values rather than inventing a colour.
  if (samples.length === 0) {
    return {
      themeColor: NEUTRAL_THEME,
      iconBackground: LIGHT_BACKGROUND,
      splashBackground: LIGHT_BACKGROUND,
    }
  }

  let luminanceTotal = 0
  for (const { red, green, blue } of samples) luminanceTotal += luminanceOf(red, green, blue)

  const background = luminanceTotal / samples.length < 0.5 ? LIGHT_BACKGROUND : DARK_BACKGROUND

  return {
    themeColor: dominantColor(samples) ?? NEUTRAL_THEME,
    iconBackground: background,
    // Mirrors the Icon Background so the PWA boot splash and the icon on it agree. It is
    // a separate field because the user may well want them to disagree.
    splashBackground: background,
  }
}
