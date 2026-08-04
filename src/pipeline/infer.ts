/** Infer editable defaults from rendered pixels and the source filename. */

import { luminanceOf } from './compose.ts'
import type { PixelBuffer } from './rasterize.ts'
import type { Hex, ManifestSettings, RenderSettings } from './types.ts'

export const INFERENCE_PROBE_SIZE = 64

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

const SHORT_NAME_LIMIT = 12

const LIGHT_BACKGROUND: Hex = '#FFFFFF'
const DARK_BACKGROUND: Hex = '#111111'

const NEUTRAL_THEME: Hex = '#FFFFFF'

/** Opaque samples avoid premultiplied-alpha and antialiasing differences. */
const OPAQUE = 255

const MIN_SATURATION = 0.15

const MIN_CHANNEL_MAX = 40
const MAX_CHANNEL_MIN = 215

/** Group nearby colors while preserving separate palette colors. */
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

export function inferNames(filename: string): InferredNames {
  const stem = (filename.split(/[/\\]/u).pop() ?? filename).replace(/\.[^.]*$/u, '')

  const words = stem.split(/[-_\s]+/u).filter((word) => word.length > 0)
  const meaningful = words.filter(
    (word) => !NOISE_TOKENS.has(word.toLowerCase()) && !/^v\d+$/iu.test(word),
  )

  // Keep all tokens when filtering would produce an empty name.
  const chosen = meaningful.length > 0 ? meaningful : words
  const name = chosen.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')

  return {
    name,
    shortName: name.length <= SHORT_NAME_LIMIT ? name : (name.split(' ')[0] ?? name),
  }
}

type Sample = { red: number; green: number; blue: number }

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

function isBrandable({ red, green, blue }: Sample): boolean {
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)

  if (max < MIN_CHANNEL_MAX) return false
  if (min > MAX_CHANNEL_MIN) return false
  return (max - min) / 255 >= MIN_SATURATION
}

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

/** Choose icon contrast and a dominant saturated theme color from rendered pixels. */
export function inferColors(probe: PixelBuffer): InferredColors {
  const samples = opaqueSamples(probe)

  // Use neutral values when there are no opaque pixels to measure.
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
    splashBackground: background,
  }
}
