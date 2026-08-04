import { beforeAll, describe, expect, test } from 'bun:test'

import type { Pipeline } from '../src/pipeline/index.ts'
import { WORDMARK_ASPECT_THRESHOLD } from '../src/pipeline/renditions.ts'
import { EmptyMarkError } from '../src/pipeline/types.ts'
import { EMPTY_FIXTURES, EQUIVALENT_FIXTURES, fixture, testPipeline } from './helpers.ts'

let pipeline: Pipeline
beforeAll(async () => {
  pipeline = await testPipeline()
})

const QUANTIZATION_TOLERANCE = 0.005

describe('measureMark — painted extents', () => {
  test('a tight export is measured exactly', () => {
    const geometry = pipeline.measureMark(fixture('square-tight'))
    expect(geometry).not.toBeNull()
    expect(geometry?.extent).toEqual({ x: 0, y: 0, w: 60, h: 60 })
  })

  test('a padded export finds the mark, not the canvas', () => {
    // The mark occupies 320,320 360x360 of a 1000x1000 canvas. The probe is 1024px
    // across that canvas, so one probe pixel is ~0.98 units and the measurement can
    // only be that accurate. `320/1000 * 1024 = 327.68` is not a pixel boundary.
    // Antialiased edges also count as painted, which biases extents outward slightly.
    const onePixel = 1000 / 1024
    const { extent } = pipeline.measureMark(fixture('square-padded')) ?? { extent: null }

    expect(extent?.x).toBeGreaterThan(320 - 2 * onePixel)
    expect(extent?.x).toBeLessThanOrEqual(320)
    expect(extent?.w).toBeGreaterThanOrEqual(360)
    expect(extent?.w).toBeLessThan(360 + 3 * onePixel)
    expect(extent?.y).toBeCloseTo(extent?.x ?? 0, 6)
    expect(extent?.h).toBeCloseTo(extent?.w ?? 0, 6)
  })

  test('invisible geometry does not inflate the measurement', () => {
    // Alpha bounds ignore invisible export frames that `getBBox()` includes.
    const reference = pipeline.measureMark(fixture('square-padded'))
    expect(reference).not.toBeNull()

    for (const name of EQUIVALENT_FIXTURES) {
      const measured = pipeline.measureMark(fixture(name))
      expect(measured, name).not.toBeNull()
      // Compare as a fraction of the mark's own size, so the 60-unit and 1000-unit
      // documents are comparable.
      expect((measured?.extent.w ?? 0) / (measured?.extent.h ?? 1)).toBeCloseTo(1, 2)
      // The four sharing a 1000x1000 canvas must agree exactly. They differ only in
      // invisible geometry that alpha measurement ignores.
      if (name !== 'square-tight') expect(measured?.extent).toEqual(reference?.extent)
    }
  })

  test('an unresolvable <image> contributes no extents', () => {
    // getBBox() reports 0,0 60x60 here because the <image> declares that geometry.
    // Only the alpha channel knows the mark is 10,10 30x30.
    const { extent } = pipeline.measureMark(fixture('external-image')) ?? { extent: null }
    expect(extent?.x).toBeCloseTo(10, 0)
    expect(extent?.w).toBeCloseTo(30, 0)
  })

  test('marks that paint nothing return null', () => {
    for (const name of EMPTY_FIXTURES) {
      expect(pipeline.measureMark(fixture(name))).toBeNull()
    }
  })
})

describe('measureMark — maxRadius', () => {
  test('a mark painting into its corners reports its half-diagonal', () => {
    // The staircase touches all four bounding-box corners, so its furthest painted
    // pixel is at the corner, or 30 * sqrt(2) for a 60-unit mark.
    const geometry = pipeline.measureMark(fixture('square-tight'))
    expect(geometry?.maxRadius).toBeCloseTo(30 * Math.SQRT2, 0)
  })

  test('maxRadius is never smaller than half the longest side', () => {
    // Otherwise the circle fit would scale a mark up past its own bounding box.
    for (const name of [...EQUIVALENT_FIXTURES, 'wordmark', 'multicolor'] as const) {
      const geometry = pipeline.measureMark(fixture(name))
      const half = Math.max(geometry?.extent.w ?? 0, geometry?.extent.h ?? 0) / 2
      expect(geometry?.maxRadius).toBeGreaterThanOrEqual(half * (1 - QUANTIZATION_TOLERANCE))
    }
  })

  test('equivalent exports agree on maxRadius relative to mark size', () => {
    const ratios = EQUIVALENT_FIXTURES.map((name) => {
      const geometry = pipeline.measureMark(fixture(name))
      return (geometry?.maxRadius ?? 0) / (geometry?.extent.w ?? 1)
    })

    for (const ratio of ratios) {
      expect(ratio).toBeCloseTo(ratios[0] ?? 0, 2)
    }
  })
})

describe('normalize', () => {
  test('throws EmptyMarkError rather than producing a blank icon', () => {
    // Empty artwork must fail instead of producing a valid-looking PNG.
    for (const name of EMPTY_FIXTURES) {
      expect(() => pipeline.normalize(fixture(name))).toThrow(EmptyMarkError)
    }
  })

  test('produces a nestable <svg> sized in document pixels', () => {
    const mark = pipeline.normalize(fixture('square-tight'))
    expect(mark.nestable).toContain('width="60"')
    expect(mark.nestable).toContain('height="60"')
    expect(mark.nestable).toContain('viewBox="0 0 60 60"')
  })

  test('the nestable form keeps its own namespace declarations', () => {
    // Round-tripping through Resvg.toString() would emit xlink:href without declaring
    // the namespace, and the result fails to re-parse.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'viewBox="0 0 60 60"><path d="M0 0 H60 V60 H0 Z" fill="#2E5BFF"/></svg>'
    expect(pipeline.normalize(svg).nestable).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  test('handles a document with no viewBox', () => {
    const mark = pipeline.normalize(fixture('no-viewbox'))
    expect(mark.docWidth).toBe(60)
    expect(mark.docHeight).toBe(60)
  })

  test('reports aspect ratio from painted extents, not the canvas', () => {
    // The wordmark canvas is 1000x300 but the ink is 1000x180.
    expect(pipeline.normalize(fixture('wordmark')).aspectRatio).toBeGreaterThan(
      WORDMARK_ASPECT_THRESHOLD,
    )
    expect(pipeline.normalize(fixture('square-padded')).aspectRatio).toBeCloseTo(1, 2)
  })
})
