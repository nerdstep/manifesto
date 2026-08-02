/**
 * The golden net.
 *
 * Shared between the golden test and the script that regenerates it, so the two can
 * never disagree about what they are hashing.
 *
 * ## Hash what the app ships
 *
 * These hash `buildBundle`'s own output map. An earlier version reimplemented the render
 * loop — `normalize` → `compose` → `rasterize` — which skipped `validate`, `optimize` and
 * `markFor` entirely. The hashes still matched, but only because SVGO happens to be
 * pixel-neutral on these fixtures: a property of the fixtures, not of the design. The day
 * optimization moved a pixel, the goldens would have kept passing while the app shipped
 * something else.
 *
 * Hashing the real output also covers `favicon.ico`, `favicon.svg` and `site.webmanifest`,
 * which the render loop could not reach at all.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Pipeline } from '../src/pipeline/index.ts'
import { ICO_MEMBERS, PNG_RENDITIONS } from '../src/pipeline/renditions.ts'
import type { Hex, Settings } from '../src/pipeline/types.ts'
import type { FixtureName } from './helpers.ts'
import { EMPTY_FIXTURES, FIXTURES, fixture } from './helpers.ts'

/**
 * Fixed so a golden change always means a pipeline change, never a settings change.
 * Deliberately not `defaultSettings` — that one is free to evolve with the tests.
 */
export const GOLDEN_SETTINGS: Settings = {
  name: 'Golden',
  shortName: 'Golden',
  themeColor: '#2E5BFF',
  iconBackground: '#FFFFFF',
  splashBackground: '#FFFFFF',
  optimizeSvg: true,
}

/** Read from the settings the goldens actually render with, so it cannot drift. */
export const GOLDEN_ICON_BACKGROUND: Hex = GOLDEN_SETTINGS.iconBackground

export const GOLDEN_FILE = join(import.meta.dir, 'golden', 'renditions.json')

/** Fixtures that paint something, so can be rendered. */
export const RENDERABLE_FIXTURES = FIXTURES.filter((name) => !EMPTY_FIXTURES.includes(name))

/** A representative subset, for scenarios that would otherwise multiply the file. */
const REPRESENTATIVE: FixtureName[] = ['square-tight', 'multicolor', 'wordmark']

/**
 * The input combinations the goldens cover.
 *
 * `dark-on-dark` exists because nothing previously covered `markFor` or the dual-embed
 * `favicon.svg` — zero of the old 84 hashes involved a Dark Mark.
 */
export const GOLDEN_SCENARIOS: {
  key: string
  fixtures: readonly FixtureName[]
  dark: FixtureName | null
  settings: Settings
}[] = [
  {
    key: 'default',
    fixtures: RENDERABLE_FIXTURES,
    dark: null,
    settings: GOLDEN_SETTINGS,
  },
  {
    // Dark Icon Background, so `markFor` must substitute the Dark Mark into the opaque
    // Renditions, and `favicon.svg` must dual-embed.
    key: 'dark-on-dark',
    fixtures: REPRESENTATIVE,
    dark: 'light-mark',
    settings: { ...GOLDEN_SETTINGS, iconBackground: '#111111' },
  },
  {
    // Proves the optimize toggle is a real branch: if these matched `default`, SVGO
    // would be doing nothing and the drift check would have nothing to guard.
    key: 'unoptimized',
    fixtures: REPRESENTATIVE,
    dark: null,
    settings: { ...GOLDEN_SETTINGS, optimizeSvg: false },
  },
]

/** Every Rendition, with a stable key — used by the geometry property tests. */
export const ALL_RENDITIONS = [
  ...ICO_MEMBERS.map((r) => ({ key: `ico-${r.treatment.size}`, treatment: r.treatment })),
  ...PNG_RENDITIONS.map((r) => ({ key: r.filename ?? '', treatment: r.treatment })),
]

/**
 * Read the golden file, validating as it goes.
 *
 * `JSON.parse` returns `any`, and casting it would mean a corrupt goldens file
 * presents as a confusing assertion failure instead of a clear one.
 */
export function readGoldens(path: string = GOLDEN_FILE): Record<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`${path} is not a JSON object`)
  }

  const goldens: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') {
      throw new TypeError(`${path}: expected a hash string for "${key}"`)
    }
    goldens[key] = value
  }
  return goldens
}

/** `fixture/scenario/filename` -> sha256 of the bytes `buildBundle` produced. */
export function renderGoldens(pipeline: Pipeline): Record<string, string> {
  const goldens: Record<string, string> = {}

  for (const scenario of GOLDEN_SCENARIOS) {
    for (const name of scenario.fixtures) {
      const bundle = pipeline.buildBundle(
        fixture(name),
        scenario.dark === null ? null : fixture(scenario.dark),
        scenario.settings,
      )

      for (const [filename, bytes] of bundle.files) {
        goldens[`${name}/${scenario.key}/${filename}`] = createHash('sha256')
          .update(bytes)
          .digest('hex')
      }
    }
  }

  return goldens
}
