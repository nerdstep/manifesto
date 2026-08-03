/**
 * The `buildBundle` seam.
 *
 * Phase 3 renders the PNG Renditions; `favicon.ico`, `favicon.svg` and
 * `site.webmanifest` arrive in Phase 4.
 */

import { beforeAll, describe, expect, test } from 'bun:test'

import { hashSource } from '../src/pipeline/index.ts'
import type { Pipeline } from '../src/pipeline/index.ts'
import { BUNDLE_FILENAMES } from '../src/pipeline/renditions.ts'
import { EmptyMarkError } from '../src/pipeline/types.ts'
import { defaultSettings, EMPTY_FIXTURES, fixture, testPipeline } from './helpers.ts'

let pipeline: Pipeline
beforeAll(async () => {
  pipeline = await testPipeline()
})

/** PNG magic bytes, so "did it produce a real image" is actually checked. */
function isPng(bytes: Uint8Array | undefined): boolean {
  if (bytes === undefined || bytes.length < 8) return false
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
}

describe('buildBundle', () => {
  test('returns a well-formed result', () => {
    const svg = fixture('square-tight')
    const result = pipeline.buildBundle(svg, null, defaultSettings)

    expect(result.files).toBeInstanceOf(Map)
    expect(Array.isArray(result.advisories)).toBe(true)
    expect(result.sourceHash).toMatch(/^[0-9a-f]{64}$/u)
    expect(result.originalBytes).toBe(new TextEncoder().encode(svg).length)
    expect(result.optimizedBytes).toBeGreaterThan(0)
  })

  test('emits every PNG Rendition as a real PNG', () => {
    const { files } = pipeline.buildBundle(fixture('square-tight'), null, defaultSettings)

    for (const name of [
      'apple-touch-icon.png',
      'icon-192.png',
      'icon-512.png',
      'icon-maskable-512.png',
    ]) {
      expect(files.has(name), `missing ${name}`).toBe(true)
      expect(isPng(files.get(name)), `${name} is not a PNG`).toBe(true)
    }
  })

  test('emits the complete Modern Minimal Set and nothing else', () => {
    const { files } = pipeline.buildBundle(fixture('square-tight'), null, defaultSettings)
    expect([...files.keys()].toSorted()).toEqual([...BUNDLE_FILENAMES].toSorted())
  })

  test('the text files are real text, not stray bytes', () => {
    const { files } = pipeline.buildBundle(fixture('square-tight'), null, defaultSettings)
    const decoder = new TextDecoder()

    const manifest = decoder.decode(files.get('site.webmanifest'))
    expect(() => JSON.parse(manifest) as unknown).not.toThrow()

    const favicon = decoder.decode(files.get('favicon.svg'))
    expect(favicon.startsWith('<svg')).toBe(true)
  })

  test('favicon.ico is an ICO container', () => {
    const { files } = pipeline.buildBundle(fixture('square-tight'), null, defaultSettings)
    const ico = Buffer.from(files.get('favicon.ico') ?? new Uint8Array())
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(3)
  })

  test('a Dark Mark reaches favicon.svg', () => {
    const decoder = new TextDecoder()
    const withDark = pipeline.buildBundle(
      fixture('square-tight'),
      fixture('light-mark'),
      defaultSettings,
    )
    expect(decoder.decode(withDark.files.get('favicon.svg'))).toContain('prefers-color-scheme')
  })

  test('reports advisories from the Dark Mark with their origin', () => {
    const result = pipeline.buildBundle(
      fixture('square-tight'),
      fixture('with-script'),
      defaultSettings,
    )

    expect(result.advisories).toContainEqual({
      kind: 'scripts-removed',
      elements: 1,
      attributes: 2,
      origin: 'dark',
    })
  })

  test('runs text, linked-image, and Wordmark checks for the Dark Mark', () => {
    const withPaintedText =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">' +
      '<rect width="20" height="20" fill="#fff"/><text x="0" y="50">Dark</text></svg>'
    const cases = [
      { svg: withPaintedText, kind: 'text-elements' },
      { svg: fixture('external-image'), kind: 'external-image' },
      { svg: fixture('wordmark'), kind: 'wordmark' },
    ] as const

    for (const { svg, kind } of cases) {
      const result = pipeline.buildBundle(fixture('square-tight'), svg, defaultSettings)
      expect(
        result.advisories.some((advisory) => advisory.kind === kind && advisory.origin === 'dark'),
      ).toBe(true)
    }
  })

  test('emitted favicon.svg contains no active foreign content', () => {
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">' +
      '<rect width="60" height="60" fill="#2E5BFF"/>' +
      '<foreignObject width="60" height="60"><iframe xmlns="http://www.w3.org/1999/xhtml" ' +
      'srcdoc="&lt;script&gt;parent.document.body.dataset.pwned=1&lt;/script&gt;"/></foreignObject>' +
      '<foreignObject/><style>@import "https://one.invalid/a.css";</style>' +
      '<style>@import "https://two.invalid/b.css";</style></svg>'
    const result = pipeline.buildBundle(malicious, null, defaultSettings)
    const favicon = new TextDecoder().decode(result.files.get('favicon.svg'))

    expect(favicon).not.toContain('foreignObject')
    expect(favicon).not.toContain('iframe')
    expect(favicon).not.toContain('srcdoc')
    expect(favicon).not.toContain('@import')
    expect(favicon).not.toContain('.invalid')
    expect(result.advisories).toContainEqual({
      kind: 'active-content-removed',
      foreignObjects: 2,
      externalStyles: 2,
    })
  })

  test('a mark that paints nothing fails loudly', () => {
    // Succeeding here would ship a valid-looking, empty icon — the worst outcome.
    for (const name of EMPTY_FIXTURES) {
      let thrown: unknown = null
      try {
        pipeline.buildBundle(fixture(name), null, defaultSettings)
      } catch (error) {
        thrown = error
      }
      expect(thrown, `${name} should not have produced a bundle`).toBeInstanceOf(EmptyMarkError)
    }
  })

  test('raises the Wordmark Warning without blocking', () => {
    const result = pipeline.buildBundle(fixture('wordmark'), null, defaultSettings)
    const warning = result.advisories.find((a) => a.kind === 'wordmark')

    expect(warning).toBeDefined()
    expect(result.files.size).toBeGreaterThan(0)
  })

  test('does not warn about marks that are close enough to square', () => {
    const result = pipeline.buildBundle(fixture('square-padded'), null, defaultSettings)
    expect(result.advisories.some((a) => a.kind === 'wordmark')).toBe(false)
  })

  test('accepts a Dark Mark, and it changes the dark-background Renditions', () => {
    const onDark = { ...defaultSettings, iconBackground: '#111111' as const }

    const without = pipeline.buildBundle(fixture('square-tight'), null, onDark)
    const withDark = pipeline.buildBundle(fixture('square-tight'), fixture('light-mark'), onDark)

    // apple-touch and maskable are opaque, so the Dark Mark must be composed there.
    expect(withDark.files.get('apple-touch-icon.png')).not.toEqual(
      without.files.get('apple-touch-icon.png'),
    )
    // The transparent Renditions have no background to be dark against.
    expect(withDark.files.get('icon-192.png')).toEqual(without.files.get('icon-192.png'))
  })

  test('optimization does not change the artwork', () => {
    // If SVGO breaks a mark, the file still parses and the damage is only in pixels.
    for (const name of ['square-tight', 'square-padded', 'multicolor', 'wordmark'] as const) {
      const result = pipeline.buildBundle(fixture(name), null, defaultSettings)
      expect(
        result.advisories.some((a) => a.kind === 'svgo-pixel-drift'),
        `${name} drifted under optimization`,
      ).toBe(false)
    }
  })
})

describe('pixelDriftPercent', () => {
  test('is zero for a document compared with itself', () => {
    const svg = fixture('square-tight')
    expect(pipeline.pixelDriftPercent(svg, svg)).toBe(0)
  })

  test('catches artwork that actually changed', () => {
    const before = fixture('square-tight')
    const after = before.replace('M0 0 H40 V20 H20 V40 H60 V60 H0 Z', 'M0 0 H60 V60 H0 Z')
    expect(pipeline.pixelDriftPercent(before, after)).toBeGreaterThan(1)
  })
})

describe('hashSource', () => {
  test('is stable and content-addressed', () => {
    const a = fixture('square-tight')
    expect(hashSource(a)).toBe(hashSource(a))
    expect(hashSource(a)).not.toBe(hashSource(fixture('square-padded')))
  })

  test('distinguishes marks that share a filename', () => {
    // The Sidecar collision guard depends on this: two different logo.svg files from
    // two different projects must not silently overwrite each other.
    expect(hashSource(fixture('monochrome'))).not.toBe(hashSource(fixture('multicolor')))
  })
})
