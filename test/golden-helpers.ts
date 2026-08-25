/** Shared golden generation used by the test and update script. */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isNil } from 'es-toolkit'

import type { Pipeline } from '../src/pipeline/index.ts'
import {
  BUNDLE_FILENAMES,
  ICO_MEMBERS,
  PNG_RENDITIONS,
  SINGLE_SCHEME_FILENAMES,
} from '../src/pipeline/renditions.ts'
import type { Hex, Settings } from '../src/pipeline/types.ts'
import type { FixtureName } from './helpers.ts'
import { EMPTY_FIXTURES, FIXTURES, fixture } from './helpers.ts'

/** Keep golden settings independent from settings used by other tests. */
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

/** Input combinations covered by the golden hashes. */
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
    // Recolor derives both marks from one monochrome fixture, so every raster
    // turns opaque and the single-scheme SVGs appear (ADR 0003, ADR 0004).
    key: 'recolored-dark',
    fixtures: ['monochrome', 'square-tight', 'wordmark'],
    dark: null,
    settings: {
      ...GOLDEN_SETTINGS,
      colorPair: { mark: '#F4F6F8', surface: '#101418' },
      primaryScheme: 'dark',
    },
  },
  {
    // This scenario confirms that the optimize toggle changes output.
    key: 'unoptimized',
    fixtures: REPRESENTATIVE,
    dark: null,
    settings: { ...GOLDEN_SETTINGS, optimizeSvg: false },
  },
]

/**
 * The files a scenario writes for each of its fixtures. Scenarios that recolor
 * list only eligible fixtures, so one answer holds for the whole scenario.
 */
export function scenarioFilenames(scenario: (typeof GOLDEN_SCENARIOS)[number]): readonly string[] {
  const twoMarks = !isNil(scenario.dark) || !isNil(scenario.settings.colorPair)
  return twoMarks ? [...BUNDLE_FILENAMES, ...SINGLE_SCHEME_FILENAMES] : BUNDLE_FILENAMES
}

/** Every Rendition with a stable key for geometry tests. */
export const ALL_RENDITIONS = [
  ...ICO_MEMBERS.map((r) => ({ key: `ico-${r.treatment.size}`, treatment: r.treatment })),
  ...PNG_RENDITIONS.map((r) => ({ key: r.filename ?? '', treatment: r.treatment })),
]

/** Read and validate golden hashes without leaking `any`. */
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
