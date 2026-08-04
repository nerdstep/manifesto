import { beforeAll, describe, expect, test } from 'bun:test'

import { compose, isDark, markFor, relativeLuminance, scaleFor } from '../src/pipeline/compose.ts'
import type { NormalizedMark, Pipeline } from '../src/pipeline/index.ts'
import { CANONICAL_SIZE, PNG_RENDITIONS, SAFE_ZONE_DIAMETER } from '../src/pipeline/renditions.ts'
import type { Treatment } from '../src/pipeline/types.ts'
import type { FixtureName } from './helpers.ts'
import { fixture, testPipeline } from './helpers.ts'

let pipeline: Pipeline
beforeAll(async () => {
  pipeline = await testPipeline()
})

const maskableSpec = PNG_RENDITIONS.find((r) => r.filename === 'icon-maskable-512.png')
if (maskableSpec === undefined) {
  throw new Error('icon-maskable-512.png is missing')
}
const maskable: Treatment = maskableSpec.treatment

const box = (inset: number): Treatment => ({
  size: 512,
  background: null,
  fit: { mode: 'box', inset },
})

/** Memoize normalization after `beforeAll` initializes the pipeline. */
const cache = new Map<FixtureName, NormalizedMark>()
function mark(name: FixtureName) {
  const existing = cache.get(name)
  if (existing !== undefined) {
    return existing
  }
  const created = pipeline.normalize(fixture(name))
  cache.set(name, created)
  return created
}

describe('luminance', () => {
  test('ranks colours the way eyes do', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    // Green reads far brighter than blue at the same channel value.
    expect(relativeLuminance('#00FF00')).toBeGreaterThan(relativeLuminance('#0000FF'))
  })

  test('accepts shorthand hex', () => {
    expect(relativeLuminance('#FFF')).toBeCloseTo(relativeLuminance('#FFFFFF'), 5)
  })

  test('isDark splits where a mark would need inverting', () => {
    expect(isDark('#111111')).toBe(true)
    expect(isDark('#2E5BFF')).toBe(true)
    expect(isDark('#FFFFFF')).toBe(false)
    expect(isDark('#F4F6F8')).toBe(false)
  })
})

describe('markFor — which mark goes on which background', () => {
  test('uses the Dark Mark on a dark Icon Background', () => {
    // Without this, apple-touch composes the light mark onto a dark background while
    // the mark designed for that exact case sits unused.
    expect(markFor(mark('square-tight'), mark('light-mark'), '#111111')).toBe(mark('light-mark'))
  })

  test('uses the Source Mark on a light background', () => {
    expect(markFor(mark('square-tight'), mark('light-mark'), '#FFFFFF')).toBe(mark('square-tight'))
  })

  test('uses the Source Mark on transparency, whatever the Dark Mark is', () => {
    // A transparent Rendition has no background to be dark against.
    expect(markFor(mark('square-tight'), mark('light-mark'), null)).toBe(mark('square-tight'))
  })

  test('falls back to the Source Mark when there is no Dark Mark', () => {
    expect(markFor(mark('square-tight'), null, '#111111')).toBe(mark('square-tight'))
  })
})

describe('scaleFor', () => {
  test('box fit scales the bounding box to the canvas minus the inset', () => {
    const m = mark('square-tight')
    expect(scaleFor(m, { mode: 'box', inset: 0 })).toBeCloseTo(CANONICAL_SIZE / 60, 4)
    expect(scaleFor(m, { mode: 'box', inset: 0.1 })).toBeCloseTo((CANONICAL_SIZE * 0.8) / 60, 4)
  })

  test('circle fit shrinks a mark that paints its own corners', () => {
    // For a mark filling its square bounding box, the furthest painted pixel is the
    // corner at s·√2/2. So circleFit = 0.8/√2 and boxFit(0.2) = 0.6, giving a ratio of
    // 0.8/(0.6·√2) = 0.943. An inset of 0.2 clips the remaining 5.7%.
    const m = mark('square-tight')
    const asBox = scaleFor(m, { mode: 'box', inset: 0.2 })
    const asCircle = scaleFor(m, { mode: 'circle', diameter: SAFE_ZONE_DIAMETER })

    expect(asCircle).toBeLessThan(asBox)
    expect(asCircle / asBox).toBeCloseTo(SAFE_ZONE_DIAMETER / (0.6 * Math.SQRT2), 2)
  })

  test('an elongated mark is scaled UP by the circle fit, not down', () => {
    // A wordmark can fill more of the safe circle than a square inset permits.
    const m = mark('wordmark')
    expect(scaleFor(m, { mode: 'circle', diameter: SAFE_ZONE_DIAMETER })).toBeGreaterThan(
      scaleFor(m, { mode: 'box', inset: 0.2 }),
    )
  })
})

describe('compose — the document', () => {
  test('emits a canonical square canvas', () => {
    expect(compose(mark('square-tight'), box(0), null)).toContain(
      `viewBox="0 0 ${CANONICAL_SIZE} ${CANONICAL_SIZE}"`,
    )
  })

  test('omits the backdrop entirely when transparent', () => {
    expect(compose(mark('square-tight'), box(0), null)).not.toContain('<rect')
  })

  test('paints a full-canvas backdrop when opaque', () => {
    const doc = compose(mark('square-tight'), box(0), '#0B1F3A')
    expect(doc).toContain(`<rect width="${CANONICAL_SIZE}" height="${CANONICAL_SIZE}"`)
    expect(doc).toContain('fill="#0B1F3A"')
  })

  test('nests the mark rather than splicing its children', () => {
    const doc = compose(mark('square-tight'), box(0), null)
    expect(doc).toContain('<g transform="translate(')
    expect(doc).toContain(mark('square-tight').nestable)
  })

  test('is deterministic', () => {
    const m = mark('square-tight')
    expect(compose(m, maskable, '#FFFFFF')).toBe(compose(m, maskable, '#FFFFFF'))
  })
})

describe('compose — Safe Zone', () => {
  /** Furthest painted pixel from the centre, and how many escape the safe circle. */
  function safeZoneReport(name: FixtureName) {
    const doc = compose(pipeline.normalize(fixture(name)), maskable, '#FFFFFF')
    const image = pipeline.rasterizeToPixels(doc, maskable.size)
    const centre = maskable.size / 2
    const safeRadius = (maskable.size * SAFE_ZONE_DIAMETER) / 2

    let outside = 0
    let painted = 0
    let maxRadius = 0

    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const i = (y * image.width + x) * 4
        const isBackdrop =
          (image.pixels[i] ?? 0) > 250 &&
          (image.pixels[i + 1] ?? 0) > 250 &&
          (image.pixels[i + 2] ?? 0) > 250
        if (isBackdrop) {
          continue
        }

        painted += 1
        const radius = Math.hypot(x + 0.5 - centre, y + 0.5 - centre)
        if (radius > safeRadius) {
          outside += 1
        }
        if (radius > maxRadius) {
          maxRadius = radius
        }
      }
    }

    return { outside, painted, maxRadius, safeRadius }
  }

  // Computed, never eyeballed. A 4px Safe Zone error looks fine in a preview and
  // clips someone's logo on a Pixel.
  for (const name of [
    'square-tight',
    'square-padded',
    'invisible-frame-none',
    'wordmark',
    'multicolor',
    'external-image',
  ] as const) {
    test(`${name} sits entirely inside the Safe Zone`, () => {
      const report = safeZoneReport(name)
      expect(report.painted).toBeGreaterThan(0)
      expect(report.outside).toBe(0)
      expect(report.maxRadius).toBeLessThanOrEqual(report.safeRadius)
    })
  }

  test('and fills it — the mark is not needlessly small', () => {
    // A fit that satisfies the Safe Zone by shrinking to nothing would pass the test
    // above. The mark must actually reach the circle.
    const report = safeZoneReport('square-tight')
    expect(report.maxRadius).toBeGreaterThan(report.safeRadius * 0.98)
  })
})
