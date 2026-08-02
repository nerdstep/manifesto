/**
 * The regression net for the whole pipeline.
 *
 * This app's entire output is pixels, and pixels are what you cannot eyeball reliably:
 * a 4px Safe Zone error looks fine in a preview and clips someone's logo on a Pixel.
 * Every file `buildBundle` emits is hashed, so anything that moves a byte fails loudly.
 *
 * If a golden fails, that is the suite doing its job. Read the diff, work out what
 * moved and why, and only then run `bun run goldens`.
 *
 * The geometry tests below are a different instrument. They assert *properties* — the
 * mark lands in the same place at the same size — through the pipeline's internal seam,
 * because a hash tells you something changed but never what.
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'

import { compose } from '../src/pipeline/compose.ts'
import type { Pipeline } from '../src/pipeline/index.ts'
import { BUNDLE_FILENAMES } from '../src/pipeline/renditions.ts'
import {
  ALL_RENDITIONS,
  GOLDEN_FILE,
  GOLDEN_ICON_BACKGROUND,
  GOLDEN_SCENARIOS,
  readGoldens,
  renderGoldens,
} from './golden-helpers.ts'
import type { FixtureName } from './helpers.ts'
import { EQUIVALENT_FIXTURES, fixture, pixelDiff, testPipeline } from './helpers.ts'

/** The four fixtures sharing a 1000x1000 canvas — identical but for invisible extras. */
const SAME_CANVAS: FixtureName[] = EQUIVALENT_FIXTURES.filter((n) => n !== 'square-tight')

type RenditionTreatment = (typeof ALL_RENDITIONS)[number]['treatment']

let pipeline: Pipeline
beforeAll(async () => {
  pipeline = await testPipeline()
})

/** Bounding box and area of the mark's pixels in a rendered Rendition. */
function paintedBox(name: FixtureName, treatment: RenditionTreatment) {
  const background = treatment.background === null ? null : GOLDEN_ICON_BACKGROUND
  const image = pipeline.rasterizeToPixels(
    compose(pipeline.normalize(fixture(name)), treatment, background),
    treatment.size,
  )

  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  let painted = 0

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const i = (y * image.width + x) * 4
      const opaqueBackdrop =
        background !== null &&
        (image.pixels[i] ?? 0) > 250 &&
        (image.pixels[i + 1] ?? 0) > 250 &&
        (image.pixels[i + 2] ?? 0) > 250
      if ((image.pixels[i + 3] ?? 0) === 0 || opaqueBackdrop) continue

      painted += 1
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  return { minX, minY, maxX, maxY, painted }
}

describe('golden renditions', () => {
  test('the golden file exists', () => {
    expect(
      existsSync(GOLDEN_FILE),
      'Missing test/golden/renditions.json — run `bun run goldens`.',
    ).toBe(true)
  })

  test('every rendition matches its golden hash', () => {
    const expected = readGoldens()
    const actual = renderGoldens(pipeline)

    // Compare whole maps so a missing or extra Rendition fails as loudly as a changed
    // one — a silently dropped icon is the worse bug.
    expect(Object.keys(actual).toSorted()).toEqual(Object.keys(expected).toSorted())
    for (const [key, hash] of Object.entries(actual)) {
      expect(hash, `pixels changed for ${key}`).toBe(expected[key] ?? '')
    }
  })

  test('rendering is deterministic within a run', () => {
    expect(renderGoldens(pipeline)).toEqual(renderGoldens(pipeline))
  })

  test('every file of every bundle is covered', () => {
    // A hash set that silently stopped including favicon.ico would still pass the
    // comparison above. This pins the shape.
    const goldens = renderGoldens(pipeline)
    const expectedCount = GOLDEN_SCENARIOS.reduce(
      (total, s) => total + s.fixtures.length * BUNDLE_FILENAMES.length,
      0,
    )

    expect(Object.keys(goldens)).toHaveLength(expectedCount)
    for (const filename of BUNDLE_FILENAMES) {
      expect(
        Object.keys(goldens).some((k) => k.endsWith(`/${filename}`)),
        `no golden covers ${filename}`,
      ).toBe(true)
    }
  })

  test('the Dark Mark path is covered', () => {
    // Zero of the previous 84 hashes involved a Dark Mark, so `markFor` and the
    // dual-embed favicon.svg had no regression cover at all.
    const goldens = renderGoldens(pipeline)
    const darkKeys = Object.keys(goldens).filter((k) => k.includes('/dark-on-dark/'))

    expect(darkKeys.length).toBeGreaterThan(0)
    expect(darkKeys.some((k) => k.endsWith('/favicon.svg'))).toBe(true)
    expect(darkKeys.some((k) => k.endsWith('/apple-touch-icon.png'))).toBe(true)
  })

  test('the scenarios actually differ from each other', () => {
    // If a scenario produced identical bytes to `default`, it would be dead weight
    // pretending to be coverage.
    const goldens = renderGoldens(pipeline)
    const at = (scenario: string, file: string) => goldens[`square-tight/${scenario}/${file}`]

    // A dark Icon Background must change the opaque Renditions...
    expect(at('dark-on-dark', 'apple-touch-icon.png')).not.toBe(
      at('default', 'apple-touch-icon.png'),
    )
    // ...and must not change the transparent ones.
    expect(at('dark-on-dark', 'icon-192.png')).toBe(at('default', 'icon-192.png'))

    // Turning optimization off changes favicon.svg, which ships the mark's own bytes.
    expect(at('unoptimized', 'favicon.svg')).not.toBe(at('default', 'favicon.svg'))
  })
})

/**
 * The Normalization contract: one mark, five exports, same icons.
 *
 * Byte-identity is NOT achievable and asking for it would be wrong. The alpha probe is
 * 1024px across, so a 1000-unit document quantizes to ~0.98 units per probe pixel and
 * `320/1000 x 1024 = 327.68` does not land on a pixel boundary. (Phase 0 reported
 * byte-identity only because that fixture's geometry happened to land exactly on
 * boundaries — luck, not a property.)
 *
 * So these assert what actually matters: the mark lands in the same place, at the same
 * size, to within a pixel.
 */
describe('normalization equivalence', () => {
  for (const { key, treatment } of ALL_RENDITIONS) {
    test(`${key}: five exports of one mark land within a pixel`, () => {
      const reference = paintedBox('square-tight', treatment)
      expect(reference.painted).toBeGreaterThan(0)

      for (const name of EQUIVALENT_FIXTURES.slice(1)) {
        const actual = paintedBox(name, treatment)

        for (const edge of ['minX', 'minY', 'maxX', 'maxY'] as const) {
          expect(
            Math.abs(actual[edge] - reference[edge]),
            `${name} ${key} ${edge}: ${actual[edge]} vs ${reference[edge]}`,
          ).toBeLessThanOrEqual(1)
        }

        // Area is the stronger check: it catches a mark that is the right size but
        // subtly deformed, which matching edges alone would miss.
        const areaRatio = actual.painted / reference.painted
        expect(areaRatio, `${name} ${key} painted area`).toBeGreaterThan(0.97)
        expect(areaRatio, `${name} ${key} painted area`).toBeLessThan(1.03)
      }
    })
  }

  test('the four identically-scaled exports are byte-identical to each other', () => {
    // These four share a 1000x1000 canvas and differ only in invisible geometry, so
    // there is no quantization difference between them and NOTHING may vary. This is
    // the assertion that would have caught the getBBox() bug outright.
    const [first, ...rest] = SAME_CANVAS
    expect(first).toBeDefined()
    if (first === undefined) return

    for (const { key, treatment } of ALL_RENDITIONS) {
      const background = treatment.background === null ? null : GOLDEN_ICON_BACKGROUND
      const render = (name: FixtureName) =>
        compose(pipeline.normalize(fixture(name)), treatment, background)

      const referenceDoc = render(first)
      const referencePixels = pipeline.rasterizeToPixels(referenceDoc, treatment.size).pixels
      const referenceBytes = pipeline.rasterize(referenceDoc, treatment.size)

      for (const name of rest) {
        const doc = render(name)
        const diff = pixelDiff(
          pipeline.rasterizeToPixels(doc, treatment.size).pixels,
          referencePixels,
        )
        expect(diff.differing, `${name} vs ${first} at ${key}`).toBe(0)
        expect(pipeline.rasterize(doc, treatment.size)).toEqual(referenceBytes)
      }
    }
  })
})
