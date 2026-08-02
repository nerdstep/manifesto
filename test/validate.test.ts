/**
 * Stage 2 — validation.
 *
 * Two properties carry the weight here: nothing executable survives into a file we
 * write to someone's web root, and a mark that needed no edits comes back untouched.
 */

import { describe, expect, test } from 'bun:test'

import { validate } from '../src/pipeline/validate.ts'
import { FIXTURES, fixture } from './helpers.ts'

/** Fixtures that should produce no advisories at all. */
const CLEAN_FIXTURES = FIXTURES.filter(
  (n) => !['with-script', 'with-text', 'external-image'].includes(n),
)

describe('validate — sanitization', () => {
  test('strips <script> elements and every on* handler', () => {
    const { sanitized } = validate(fixture('with-script'))

    expect(sanitized).not.toContain('<script')
    expect(sanitized).not.toContain('onload')
    expect(sanitized).not.toContain('onclick')
    expect(sanitized).not.toContain('alert(')
  })

  test('keeps the artwork while removing the scripting', () => {
    // Stripping must be surgical: the mark itself has to survive intact.
    const { sanitized } = validate(fixture('with-script'))
    expect(sanitized).toContain('M0 0 H40 V20 H20 V40 H60 V60 H0 Z')
    expect(sanitized).toContain('#2E5BFF')
    expect(sanitized).toContain('viewBox="0 0 60 60"')
  })

  test('reports what it removed rather than editing silently', () => {
    const { advisories } = validate(fixture('with-script'))
    const removed = advisories.find((a) => a.kind === 'scripts-removed')

    expect(removed).toBeDefined()
    expect(removed).toMatchObject({ elements: 1, attributes: 2 })
  })

  test('a mark needing no edits passes through byte-for-byte', () => {
    // A user who turned optimization off should get exactly the file they dropped,
    // not SVGO's re-serialization of it.
    for (const name of CLEAN_FIXTURES) {
      const source = fixture(name)
      expect(validate(source).sanitized).toBe(source)
    }
  })
})

describe('validate — advisories', () => {
  test('counts text containers', () => {
    const { advisories } = validate(fixture('with-text'))
    expect(advisories).toContainEqual({ kind: 'text-elements', count: 1 })
  })

  test('does not double-count <tspan> inside <text>', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">' +
      '<text x="0" y="20">a<tspan>b</tspan><tspan>c</tspan></text></svg>'
    const { advisories } = validate(svg)
    expect(advisories).toContainEqual({ kind: 'text-elements', count: 1 })
  })

  test('flags images it cannot resolve, and reports the href', () => {
    const { advisories } = validate(fixture('external-image'))
    expect(advisories).toContainEqual({
      kind: 'external-image',
      hrefs: ['https://example.invalid/must-never-be-fetched.png'],
    })
  })

  test('a relative href is unresolvable too — there is no base to resolve against', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">' +
      '<image href="./logo.png" width="60" height="60"/></svg>'
    const { advisories } = validate(svg)
    expect(advisories).toContainEqual({ kind: 'external-image', hrefs: ['./logo.png'] })
  })

  test('inline data: images are fine and raise nothing', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">' +
      '<image href="data:image/png;base64,iVBORw0KGgo=" width="60" height="60"/></svg>'
    expect(validate(svg).advisories).toEqual([])
  })

  test('handles xlink:href as well as href', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'viewBox="0 0 60 60"><image xlink:href="https://x.invalid/a.png" width="60" height="60"/></svg>'
    const { advisories } = validate(svg)
    expect(advisories).toContainEqual({
      kind: 'external-image',
      hrefs: ['https://x.invalid/a.png'],
    })
  })

  test('clean marks raise nothing', () => {
    for (const name of CLEAN_FIXTURES) {
      expect(validate(fixture(name)).advisories).toEqual([])
    }
  })
})

describe('validate — namespace handling', () => {
  test('a namespace-prefixed script is still a script', () => {
    // Detection has to be namespace-aware, or `<svg:script>` walks straight through.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" ' +
      'viewBox="0 0 60 60"><svg:script>alert(1)</svg:script>' +
      '<path d="M0 0 H60 V60 H0 Z" fill="#000"/></svg>'
    const { sanitized, advisories } = validate(svg)

    expect(sanitized).not.toContain('alert(1)')
    expect(advisories.some((a) => a.kind === 'scripts-removed')).toBe(true)
  })
})
