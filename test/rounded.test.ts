import { beforeAll, describe, expect, test } from 'bun:test'

import icoEndec from 'ico-endec'

import { backdrop, canvas, compose, composeInner } from '../src/pipeline/compose.ts'
import type { Pipeline, Settings } from '../src/pipeline/index.ts'
import { ICO_MEMBER_SIZES, OPAQUE_INSET } from '../src/pipeline/renditions.ts'
import { SQUIRCLE_PATH } from '../src/shared/icon-shape.ts'
import { defaultSettings, fixture, testPipeline } from './helpers.ts'

let pipeline: Pipeline
beforeAll(async () => {
  pipeline = await testPipeline()
})

const settings: Settings = {
  ...defaultSettings,
  colorPair: { mark: '#FFFFFF', surface: '#000000' },
  recolorEnabled: true,
  roundedCorners: true,
}
const square =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="black"/></svg>'

function file(files: Map<string, Uint8Array>, name: string): Uint8Array {
  const bytes = files.get(name)
  if (bytes === undefined) {
    throw new Error(`Missing ${name}`)
  }
  return bytes
}

function pngPixels(bytes: Uint8Array, size: number) {
  return pipeline.rasterizeToPixels(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><image width="${size}" height="${size}" href="data:image/png;base64,${Buffer.from(bytes).toString('base64')}"/></svg>`,
    size,
  ).pixels
}

function expectCorners(pixels: Uint8Array, size: number, alpha: number) {
  for (const [x, y] of [
    [0, 0],
    [size - 1, 0],
    [0, size - 1],
    [size - 1, size - 1],
  ]) {
    expect(pixels[((y ?? 0) * size + (x ?? 0)) * 4 + 3]).toBe(alpha)
  }
  expect(pixels[(Math.floor(size / 2) * size + Math.floor(size / 2)) * 4 + 3]).toBe(255)
}

describe('Rounded Corners', () => {
  test('exported corners have flat sides and a fuller silhouette than the Android preview', () => {
    const exported = pipeline.rasterizeToPixels(canvas('', '#FFFFFF', true), 1000).pixels
    const android = pipeline.rasterizeToPixels(
      canvas(`<path d="${SQUIRCLE_PATH}" transform="scale(1000)" fill="#FFFFFF"/>`, null),
      1000,
    ).pixels
    // Edge samples distinguish a flat-sided icon from the continuously bowed launcher mask.
    for (const [x, y] of [
      [400, 0],
      [999, 400],
      [400, 999],
      [0, 400],
      [80, 80],
    ] as const) {
      const alpha = (y * 1000 + x) * 4 + 3
      expect(exported[alpha]).toBe(255)
      expect(android[alpha]).toBe(0)
    }
  })

  test('PNG and every ICO size have transparent corners and an opaque center', () => {
    const { files } = pipeline.buildBundle(square, null, settings)
    for (const size of [192, 512]) {
      expectCorners(pngPixels(file(files, `icon-${size}.png`), size), size, 0)
    }
    const members = icoEndec.decode(Buffer.from(file(files, 'favicon.ico')))
    expect(members.map((member) => member.width)).toEqual([...ICO_MEMBER_SIZES])
    for (const member of members) {
      expectCorners(pngPixels(member.imageData, member.width), member.width, 0)
    }
  })

  test('SVG schemes match the corresponding PNG, including the mode-switching favicon', () => {
    const light = pipeline.buildBundle(square, null, settings).files
    const dark = pipeline.buildBundle(square, null, { ...settings, primaryScheme: 'dark' }).files
    const dual = new TextDecoder().decode(file(light, 'favicon.svg'))
    expect(file(dark, 'favicon.svg')).toEqual(file(light, 'favicon.svg'))
    for (const [scheme, files] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      const png = pngPixels(file(files, 'icon-192.png'), 192)
      const svg = new TextDecoder().decode(file(files, `favicon-${scheme}.svg`))
      expect(pipeline.rasterizeToPixels(svg, 192).pixels).toEqual(png)
      const selected = dual.replace(
        /<style>[\s\S]*?<\/style>/u,
        `<style>.mfo-light{display:${scheme === 'light' ? 'inline' : 'none'}}.mfo-dark{display:${scheme === 'dark' ? 'inline' : 'none'}}</style>`,
      )
      expect(pipeline.rasterizeToPixels(selected, 192).pixels).toEqual(png)
      expectCorners(png, 192, 0)
    }
  })

  test('platform Renditions remain byte-identical and fully opaque', () => {
    const rounded = pipeline.buildBundle(square, null, settings).files
    const plain = pipeline.buildBundle(square, null, { ...settings, roundedCorners: false }).files
    for (const [name, size] of [
      ['apple-touch-icon.png', 180],
      ['icon-maskable-512.png', 512],
    ] as const) {
      expect(file(rounded, name)).toEqual(file(plain, name))
      expectCorners(pngPixels(file(rounded, name), size), size, 255)
    }
  })

  test('the existing inset fits even a solid square without clipping or shrinking artwork', () => {
    const mark = pipeline.normalize(square)
    const treatment = {
      size: 512,
      background: null,
      fit: { mode: 'box', inset: OPAQUE_INSET },
    } as const
    const plain = compose(mark, treatment, '#FFFFFF')
    const rounded = compose(mark, { ...treatment, rounded: true }, '#FFFFFF')
    expect(rounded).toContain(composeInner(mark, treatment))
    const body = pipeline.rasterizeToPixels(
      canvas(composeInner(mark, treatment), null),
      1000,
    ).pixels
    const surface = pipeline.rasterizeToPixels(canvas(backdrop('#FFFFFF', true), null), 1000).pixels
    let escaped = 0
    for (let i = 3; i < body.length; i += 4) {
      if ((body[i] ?? 0) > 0 && (surface[i] ?? 0) === 0) {
        escaped += 1
      }
    }
    expect(escaped).toBe(0)
    // Every fully painted black pixel survives at the same location and size.
    const before = pipeline.rasterizeToPixels(plain, 512).pixels
    const after = pipeline.rasterizeToPixels(rounded, 512).pixels
    let black = 0
    for (let i = 0; i < before.length; i += 4) {
      if (before[i] === 0 && before[i + 3] === 255) {
        black += 1
        if (after[i] !== 0 || after[i + 3] !== 255) {
          throw new Error(`Lost artwork at pixel ${i / 4}`)
        }
      }
    }
    expect(black).toBeGreaterThan(100_000)
  })

  test('rounding is dormant when recolor is disabled, absent, or ineligible', () => {
    for (const [source, dark, change] of [
      [square, null, { recolorEnabled: false }],
      [square, null, { colorPair: null }],
      [fixture('multicolor'), null, {}],
      [square, fixture('light-mark'), {}],
    ] as const) {
      const dormant = { ...settings, ...change }
      const actual = pipeline.buildBundle(source, dark, dormant)
      const expected = pipeline.buildBundle(source, dark, { ...dormant, roundedCorners: false })
      expect(actual.files).toEqual(expected.files)
      if (dark === null) {
        expect(actual.files.has('favicon-dark.svg')).toBe(false)
      }
    }
  })

  test('old settings keep recolor enabled and rounding off; explicit disable restores original artwork', () => {
    const legacy = { ...defaultSettings, colorPair: settings.colorPair }
    expect(pipeline.buildBundle(square, null, legacy).files).toEqual(
      pipeline.buildBundle(square, null, { ...legacy, recolorEnabled: true, roundedCorners: false })
        .files,
    )
    expect(
      pipeline.buildBundle(square, null, { ...settings, recolorEnabled: false }).files,
    ).toEqual(pipeline.buildBundle(square, null, defaultSettings).files)
  })
})
