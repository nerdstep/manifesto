import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { EMPTY_FIXTURES, EQUIVALENT_FIXTURES, FIXTURE_DIR, FIXTURES, fixture } from './helpers.ts'

const PAINTED_ELEMENT = /<(path|circle|rect|polygon|ellipse|line|polyline)\b/u

const colours = (svg: string) => new Set(svg.match(/#[0-9A-Fa-f]{6}/gu) ?? [])

describe('fixtures', () => {
  for (const name of FIXTURES) {
    test(`${name}.svg exists and is a well-formed SVG document`, () => {
      expect(existsSync(join(FIXTURE_DIR, `${name}.svg`))).toBe(true)
      const svg = fixture(name)
      expect(svg).toContain('<svg')
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
      expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    })
  }

  test('the equivalence set all paint the same mark', () => {
    // Only the canvas and invisible elements differ.
    for (const name of EQUIVALENT_FIXTURES) {
      const svg = fixture(name)
      expect(svg).toContain('M0 0 H40 V20 H20 V40 H60 V60 H0 Z')
      expect(svg).toContain('#2E5BFF')
    }
  })

  test('the invisible-frame fixtures each carry a full-canvas non-painting rect', () => {
    expect(fixture('invisible-frame-none')).toContain('fill="none"')
    expect(fixture('invisible-frame-opacity')).toContain('opacity="0"')
    expect(fixture('invisible-frame-transparent')).toContain('fill="transparent"')

    for (const name of [
      'invisible-frame-none',
      'invisible-frame-opacity',
      'invisible-frame-transparent',
    ] as const) {
      expect(fixture(name)).toContain('width="1000" height="1000"')
    }
  })

  test('empty fixtures contain no painted geometry', () => {
    for (const name of EMPTY_FIXTURES) {
      const withoutDefs = fixture(name).replaceAll(/<defs>[\s\S]*?<\/defs>/gu, '')
      expect(PAINTED_ELEMENT.test(withoutDefs)).toBe(false)
    }
  })

  test('with-script carries both a <script> element and an on* attribute', () => {
    const svg = fixture('with-script')
    expect(svg).toContain('<script>')
    expect(svg).toMatch(/\bon(load|click)=/u)
  })

  test('external-image references an unresolvable remote host', () => {
    const svg = fixture('external-image')
    expect(svg).toMatch(/href="https:\/\//u)
    // .invalid is reserved by RFC 2606 and can never resolve, so a regression that
    // starts fetching fails loudly instead of silently hitting a real server.
    expect(svg).toContain('.invalid')
  })

  test('wordmark is wide enough to trip the Wordmark Warning', () => {
    expect(fixture('wordmark')).toContain('viewBox="0 0 1000 300"')
  })

  test('no-viewbox really has no viewBox', () => {
    // Ignore the fixture comment when checking its markup.
    const markup = fixture('no-viewbox').replaceAll(/<!--[\s\S]*?-->/gu, '')
    expect(markup).not.toMatch(/viewBox\s*=/u)
    expect(markup).toContain('width="60"')
  })

  test('monochrome uses one colour, multicolor uses more than one', () => {
    expect(colours(fixture('monochrome')).size).toBe(1)
    expect(colours(fixture('multicolor')).size).toBeGreaterThan(1)
  })
})
