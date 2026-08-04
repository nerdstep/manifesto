import { describe, expect, test } from 'bun:test'

import { optimize } from '../src/pipeline/optimize.ts'
import { FIXTURES, fixture } from './helpers.ts'

describe('optimize — the toggle', () => {
  test('disabled is a true no-op, not a re-serialization', () => {
    for (const name of FIXTURES) {
      const source = fixture(name)
      const result = optimize(source, false)

      expect(result.svg).toBe(source)
      expect(result.optimizedBytes).toBe(result.originalBytes)
    }
  })

  test('enabled reports an honest byte delta', () => {
    const source = fixture('with-text')
    const result = optimize(source, true)

    expect(result.originalBytes).toBe(new TextEncoder().encode(source).length)
    expect(result.optimizedBytes).toBe(new TextEncoder().encode(result.svg).length)
    expect(result.optimizedBytes).toBeLessThan(result.originalBytes)
  })

  test('never grows a fixture', () => {
    for (const name of FIXTURES) {
      const { originalBytes, optimizedBytes } = optimize(fixture(name), true)
      expect(optimizedBytes).toBeLessThanOrEqual(originalBytes)
    }
  })
})

describe('optimize — guards against icon-hostile plugins', () => {
  test('viewBox survives, even when width/height duplicate it', () => {
    // `removeViewBox` drops viewBox when it matches width/height. For an icon that is
    // fatal. The mark stops scaling, and Normalization nests this document inside a
    // sized viewport with nothing to scale against. SVGO v4 dropped the plugin from
    // preset-default; this test is what notices if that ever changes.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">' +
      '<path d="M0 0 H40 V20 H20 V40 H60 V60 H0 Z" fill="#2E5BFF"/></svg>'

    expect(optimize(svg, true).svg).toContain('viewBox="0 0 60 60"')
  })

  test('every fixture keeps its viewBox through optimization', () => {
    for (const name of FIXTURES) {
      const source = fixture(name)
      if (!/viewBox\s*=/u.test(source.replaceAll(/<!--[\s\S]*?-->/gu, ''))) continue
      expect(optimize(source, true).svg).toContain('viewBox')
    }
  })

  test('referenced ids are preserved', () => {
    // `cleanupIds` renames and prunes ids. Its classic failure is two gradients that
    // shared an id after export being collapsed into one, silently recolouring part of
    // the mark without raising an error.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">' +
      '<defs><linearGradient id="brandGradient"><stop offset="0" stop-color="#2E5BFF"/>' +
      '<stop offset="1" stop-color="#FF8A3D"/></linearGradient></defs>' +
      '<path d="M0 0 H60 V60 H0 Z" fill="url(#brandGradient)"/></svg>'

    const result = optimize(svg, true).svg
    expect(result).toContain('id="brandGradient"')
    expect(result).toContain('url(#brandGradient)')
  })
})

describe('optimize — output stays usable', () => {
  test('the mark itself survives', () => {
    const result = optimize(fixture('square-tight'), true).svg
    expect(result).toContain('<svg')
    expect(result.trimEnd().endsWith('</svg>')).toBe(true)
    // SVGO lower-cases hex colours and may rewrite them to shorthand or a keyword, so
    // compare case-insensitively. This is also why colour inference reads rendered
    // pixels rather than markup.
    expect(result.toLowerCase()).toContain('#2e5bff')
  })

  test('is idempotent — optimizing twice changes nothing further', () => {
    // If a second pass keeps shrinking, the first was incomplete and the byte delta
    // shown to the user is a lie.
    for (const name of FIXTURES) {
      const once = optimize(fixture(name), true).svg
      expect(optimize(once, true).svg).toBe(once)
    }
  })
})
