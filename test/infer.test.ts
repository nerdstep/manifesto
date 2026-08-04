import { beforeAll, describe, expect, test } from 'bun:test'

import {
  inferColors,
  INFERENCE_PROBE_SIZE,
  inferNames,
  luminanceOf,
  relativeLuminance,
} from '../src/pipeline/index.ts'
import type { Pipeline } from '../src/pipeline/index.ts'
import { fixture, testPipeline } from './helpers.ts'
import type { FixtureName } from './helpers.ts'

let pipeline: Pipeline

beforeAll(async () => {
  pipeline = await testPipeline()
})

function colorsOf(name: FixtureName) {
  return inferColors(pipeline.rasterizeToPixels(fixture(name), INFERENCE_PROBE_SIZE))
}

describe('inferNames', () => {
  test('strips noise tokens and title-cases the rest', () => {
    expect(inferNames('acme-logo-final-v3.svg').name).toBe('Acme')
    expect(inferNames('acme_icon.svg').name).toBe('Acme')
    expect(inferNames('northwind-trading-logo.svg').name).toBe('Northwind Trading')
  })

  test('ignores directories and extensions, with either separator', () => {
    // A filename can arrive from a webview drop, so it may carry a separator belonging
    // to a platform other than the one running this code.
    expect(inferNames('/some/deep/path/acme-logo.svg').name).toBe('Acme')
    expect(inferNames('C:\\Users\\me\\acme-logo.svg').name).toBe('Acme')
  })

  test('falls back to the stem when everything would be stripped', () => {
    // Better a strange name in a visible, editable field than an empty one.
    expect(inferNames('logo.svg').name).toBe('Logo')
    expect(inferNames('icon-final.svg').name).toBe('Icon Final')
  })

  test('does not invent a name for an unhelpful filename', () => {
    // Keep a visible fallback that the user can correct.
    expect(inferNames('Untitled-1.svg').name).toBe('Untitled 1')
  })

  test('leaves capitalisation inside words alone', () => {
    expect(inferNames('McKinsey.svg').name).toBe('McKinsey')
  })

  test('short name keeps a short name whole and shortens a long one to one word', () => {
    expect(inferNames('acme.svg').shortName).toBe('Acme')
    // `Northwind Trading` exceeds the home screen label limit.
    expect(inferNames('northwind-trading-logo.svg').shortName).toBe('Northwind')
  })
})

describe('inferColors', () => {
  test('takes the dominant saturated colour as the Theme Color', () => {
    // A solid color should survive bucketing without shifting.
    expect(colorsOf('multicolor').themeColor).toBe('#2E5BFF')
  })

  test('refuses to tint the address bar from a monochrome mark', () => {
    // #111111 is ink, not brand colour. Reporting it would paint someone's Chrome
    // address bar black because their logo happens to be a black glyph.
    expect(colorsOf('monochrome').themeColor).toBe('#FFFFFF')
    // Near-white is the same mistake in the other direction.
    expect(colorsOf('light-mark').themeColor).toBe('#FFFFFF')
  })

  test('chooses an Icon Background the mark can be seen against', () => {
    // Near-white marks need a dark background in opaque Renditions.
    const light = colorsOf('light-mark')
    expect(light.iconBackground).toBe('#111111')
    expect(colorsOf('monochrome').iconBackground).toBe('#FFFFFF')
    expect(colorsOf('multicolor').iconBackground).toBe('#FFFFFF')
  })

  test('the Icon Background always contrasts with the mark it sits behind', () => {
    for (const name of ['monochrome', 'multicolor', 'light-mark', 'square-tight'] as const) {
      const { iconBackground } = colorsOf(name)
      const probe = pipeline.rasterizeToPixels(fixture(name), INFERENCE_PROBE_SIZE)

      let total = 0
      let counted = 0
      for (let i = 0; i + 3 < probe.pixels.length; i += 4) {
        if ((probe.pixels[i + 3] ?? 0) < 255) continue
        total += luminanceOf(
          probe.pixels[i] ?? 0,
          probe.pixels[i + 1] ?? 0,
          probe.pixels[i + 2] ?? 0,
        )
        counted += 1
      }

      const markLuminance = total / counted
      const backgroundLuminance = relativeLuminance(iconBackground)
      expect(Math.abs(markLuminance - backgroundLuminance)).toBeGreaterThan(0.3)
    }
  })

  test('the Splash Background mirrors the Icon Background', () => {
    for (const name of ['monochrome', 'multicolor', 'light-mark'] as const) {
      const { iconBackground, splashBackground } = colorsOf(name)
      expect(splashBackground).toBe(iconBackground)
    }
  })

  test('a mark with no opaque pixel yields neutral values rather than a guess', () => {
    expect(
      inferColors({ width: 1, height: 1, pixels: new Uint8Array([200, 30, 30, 128]) }),
    ).toEqual({
      themeColor: '#FFFFFF',
      iconBackground: '#FFFFFF',
      splashBackground: '#FFFFFF',
    })
  })
})

describe('inferSettings', () => {
  test('is the whole panel opening state in one call', () => {
    const settings = pipeline.inferSettings(fixture('multicolor'), 'northwind-trading-logo.svg')

    expect(settings).toEqual({
      name: 'Northwind Trading',
      shortName: 'Northwind',
      themeColor: '#2E5BFF',
      iconBackground: '#FFFFFF',
      splashBackground: '#FFFFFF',
      optimizeSvg: true,
    })
  })

  test('produces settings a Bundle can actually be built from', () => {
    // Inferred values must satisfy the pipeline's input validation.
    const svg = fixture('square-tight')
    const bundle = pipeline.buildBundle(svg, null, pipeline.inferSettings(svg, 'acme-logo.svg'))
    expect(bundle.files.size).toBeGreaterThan(0)
  })
})
