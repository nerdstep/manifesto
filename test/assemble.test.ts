import { beforeAll, describe, expect, test } from 'bun:test'

import icoEndec from 'ico-endec'

import {
  buildFaviconSvg,
  buildWebManifest,
  HEAD_SNIPPET,
  packIco,
} from '../src/pipeline/assemble.ts'
import { compose } from '../src/pipeline/compose.ts'
import type { Pipeline } from '../src/pipeline/index.ts'
import {
  BUNDLE_FILENAMES,
  ICO_MEMBER_SIZES,
  ICO_MEMBERS,
  PNG_RENDITIONS,
} from '../src/pipeline/renditions.ts'
import type { FixtureName } from './helpers.ts'
import { defaultSettings, fixture, parseJsonObject, testPipeline } from './helpers.ts'

/** Widened so `toContain` can be given a plain string. */
const BUNDLE_FILES: string[] = [...BUNDLE_FILENAMES]

let pipeline: Pipeline
beforeAll(async () => {
  pipeline = await testPipeline()
})

/** A mark carrying an id and a class, which the fixtures deliberately do not. */
const GRADIENT_MARK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">' +
  '<defs><linearGradient id="paint0_linear"><stop offset="0" stop-color="#2E5BFF"/>' +
  '<stop offset="1" stop-color="#FF8A3D"/></linearGradient></defs>' +
  '<path class="body" d="M0 0 H60 V60 H0 Z" fill="url(#paint0_linear)"/></svg>'

const GRADIENT_MARK_DARK = GRADIENT_MARK.replace('#2E5BFF', '#101010')

/** Called inside tests after `beforeAll` has initialized `pipeline`. */
function icoOf(name: FixtureName) {
  const mark = pipeline.normalize(fixture(name))
  return packIco(
    ICO_MEMBERS.map((r) => pipeline.rasterize(compose(mark, r.treatment, null), r.treatment.size)),
  )
}

function dualFavicon() {
  return buildFaviconSvg(
    pipeline.normalize(fixture('square-tight')),
    pipeline.normalize(fixture('light-mark')),
  )
}

describe('packIco', () => {
  test('produces a well-formed ICO container', () => {
    const ico = Buffer.from(icoOf('square-tight'))
    expect(ico.readUInt16LE(0)).toBe(0) // reserved
    expect(ico.readUInt16LE(2)).toBe(1) // 1 = ICO, 2 = CUR
    expect(ico.readUInt16LE(4)).toBe(ICO_MEMBER_SIZES.length)
  })

  test('embeds PNG streams, not BMP', () => {
    // Modern ICO files embed PNG directly. BMP is larger and lacks bitmask support.
    const entries = icoEndec.decode(Buffer.from(icoOf('square-tight')))
    expect(entries.map((e) => e.imageType)).toEqual(['png', 'png', 'png'])
  })

  test('round-trips every declared size', () => {
    const entries = icoEndec.decode(Buffer.from(icoOf('square-padded')))
    expect(entries.map((e) => e.width)).toEqual([...ICO_MEMBER_SIZES])
    expect(entries.map((e) => e.height)).toEqual([...ICO_MEMBER_SIZES])
  })

  test('refuses to build an empty icon', () => {
    expect(() => packIco([])).toThrow()
  })
})

describe('buildFaviconSvg — single mark', () => {
  test('is a valid standalone SVG document', () => {
    const svg = buildFaviconSvg(pipeline.normalize(fixture('square-tight')), null)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
  })

  test('carries no dark-mode machinery when there is no Dark Mark', () => {
    const svg = buildFaviconSvg(pipeline.normalize(fixture('square-tight')), null)
    expect(svg).not.toContain('prefers-color-scheme')
    expect(svg).not.toContain('<style>')
  })

  test('is normalized like the raster Renditions, not left as-dropped', () => {
    // Every favicon format must use the same normalized geometry.
    const padded = buildFaviconSvg(pipeline.normalize(fixture('square-padded')), null)
    const tight = buildFaviconSvg(pipeline.normalize(fixture('square-tight')), null)

    expect(padded).toContain('viewBox="0 0 1000 1000"')
    expect(padded).toContain('<g transform="translate(')
    // Both crop to the mark, so both scale it up rather than leaving canvas around it.
    for (const svg of [padded, tight]) {
      const scale = /scale\(([\d.]+)\)/u.exec(svg)?.[1]
      expect(Number(scale)).toBeGreaterThan(2)
    }
  })

  test('has no opaque backdrop — it sits on browser tab chrome', () => {
    expect(buildFaviconSvg(pipeline.normalize(fixture('square-tight')), null)).not.toContain(
      '<rect',
    )
  })
})

describe('buildFaviconSvg — dual embed', () => {
  test('embeds both marks behind a prefers-color-scheme toggle', () => {
    const svg = dualFavicon()
    expect(svg).toContain('@media(prefers-color-scheme:dark)')
    expect(svg).toContain('class="mfo-light"')
    expect(svg).toContain('class="mfo-dark"')
  })

  test('shows the light mark by default', () => {
    // Safari ignores prefers-color-scheme in SVG favicons entirely, so whichever mark
    // is the default is what Safari users always see.
    const svg = dualFavicon()
    expect(svg).toContain('.mfo-dark{display:none}')
    const lightIndex = svg.indexOf('class="mfo-light"')
    const darkIndex = svg.indexOf('class="mfo-dark"')
    expect(lightIndex).toBeGreaterThan(-1)
    expect(lightIndex).toBeLessThan(darkIndex)
  })

  test('both marks are actually present', () => {
    // Unoptimized marks retain the author's original color casing.
    const svg = dualFavicon().toLowerCase()
    expect(svg).toContain('#2e5bff') // source mark
    expect(svg).toContain('#f4f6f8') // dark mark
  })

  test('namespaces ids so the two marks cannot collide', () => {
    // Two Figma exports may both contain `id="paint0_linear"`. In one document the
    // browser may ignore the duplicate and render both marks with one gradient.
    const dual = buildFaviconSvg(
      pipeline.normalize(GRADIENT_MARK),
      pipeline.normalize(GRADIENT_MARK_DARK),
    )

    const ids = [...dual.matchAll(/id="([^"]+)"/gu)].map((m) => m[1])
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size, `ids collided: ${ids.join(', ')}`).toBe(2)

    // Every rewritten reference must resolve to an existing id.
    const refs = [...dual.matchAll(/url\(#([^)]+)\)/gu)].map((m) => m[1])
    expect(refs).toHaveLength(2)
    for (const ref of refs) expect(ids).toContain(ref)
  })

  test('namespaces class names too', () => {
    const dual = buildFaviconSvg(
      pipeline.normalize(GRADIENT_MARK),
      pipeline.normalize(GRADIENT_MARK_DARK),
    )
    // The marks' own `class="body"` must not survive unprefixed into a document whose
    // toggle rules are class-based.
    expect(dual).not.toContain('class="body"')
  })
})

describe('buildWebManifest', () => {
  // Manifest generation is independent from render state.
  const manifest = parseJsonObject(buildWebManifest(defaultSettings))

  test('carries the panel fields', () => {
    expect(manifest.name).toBe(defaultSettings.name)
    expect(manifest.short_name).toBe(defaultSettings.shortName)
    expect(manifest.theme_color).toBe(defaultSettings.themeColor)
    expect(manifest.background_color).toBe(defaultSettings.splashBackground)
  })

  test('background_color is the Splash Background, never the Icon Background', () => {
    // Two different concepts that both hold a colour. Conflating them is what RFG does.
    const distinct = { ...defaultSettings, iconBackground: '#111111' as const }
    const parsed = parseJsonObject(buildWebManifest(distinct))
    expect(parsed.background_color).toBe(distinct.splashBackground)
    expect(parsed.background_color).not.toBe(distinct.iconBackground)
  })

  test('hardcodes the PWA fields — this is not a PWA configurator', () => {
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.id).toBe('/')
  })

  test('declares 192 any, 512 any and 512 maskable', () => {
    expect(manifest.icons).toEqual([
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ])
  })

  test('never uses the "any maskable" anti-pattern', () => {
    // Maskable padding makes icons rendered in `any` slots appear too small.
    expect(buildWebManifest(defaultSettings)).not.toContain('any maskable')
  })

  test('is valid JSON ending in a newline', () => {
    const text = buildWebManifest(defaultSettings)
    expect(text.endsWith('}\n')).toBe(true)
    expect(() => JSON.parse(text) as unknown).not.toThrow()
  })
})

describe('cross-checks between separately generated things', () => {
  test('every manifest icon src is a file the bundle actually emits', () => {
    // Reads the src out of each entry without asserting a shape, so a manifest that
    // stopped declaring `src` fails here rather than passing vacuously.
    const srcs = [...buildWebManifest(defaultSettings).matchAll(/"src":\s*"([^"]+)"/gu)].map(
      (match) => match[1] ?? '',
    )

    expect(srcs.length).toBeGreaterThan(0)
    for (const src of srcs) {
      expect(BUNDLE_FILES, `manifest references ${src}`).toContain(src.replace(/^\//u, ''))
    }
  })

  test('every file the Head Snippet references is one the bundle emits', () => {
    const referenced = [...HEAD_SNIPPET.matchAll(/href="\/([^"]+)"/gu)].map((m) => m[1] ?? '')
    expect(referenced.length).toBeGreaterThan(0)
    for (const file of referenced) {
      expect(BUNDLE_FILES, `snippet references ${file}`).toContain(file)
    }
  })

  test('the manifest covers every Rendition that declares a purpose', () => {
    const declared = PNG_RENDITIONS.filter((r) => r.manifestPurpose !== undefined)
    const icons = parseJsonObject(buildWebManifest(defaultSettings)).icons
    expect(icons).toHaveLength(declared.length)
  })

  test('apple-touch-icon is referenced from <head>, not the manifest', () => {
    expect(HEAD_SNIPPET).toContain('apple-touch-icon.png')
    expect(buildWebManifest(defaultSettings)).not.toContain('apple-touch-icon')
  })
})
