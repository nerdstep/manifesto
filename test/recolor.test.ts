import { describe, expect, test } from 'bun:test'

import { monochromePaint, recolor, toHex } from '../src/pipeline/recolor.ts'

const wrap = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`

const BOX = '<path d="M0 0 H10 V10 H0 Z"'

describe('toHex', () => {
  test('normalizes every flat color spelling to six-digit hex', () => {
    expect(toHex('#111')).toBe('#111111')
    expect(toHex('#111111')).toBe('#111111')
    expect(toHex(' RGB(17, 17, 17) ')).toBe('#111111')
    expect(toHex('black')).toBe('#000000')
  })

  test('rejects paint that is not a flat color', () => {
    expect(toHex('currentColor')).toBeNull()
    expect(toHex('url(#gradient)')).toBeNull()
    expect(toHex('inherit')).toBeNull()
    expect(toHex('rgb(300,0,0)')).toBeNull()
  })
})

describe('monochromePaint', () => {
  test('finds the single color however it is spelled', () => {
    expect(monochromePaint(wrap(`${BOX} fill="#111"/><circle r="1" fill="rgb(17,17,17)"/>`))).toBe(
      '#111111',
    )
  })

  test('reads a fill from a style declaration', () => {
    expect(monochromePaint(wrap(`${BOX} style="fill: #111111"/>`))).toBe('#111111')
  })

  test('treats an undeclared fill as SVG black', () => {
    expect(monochromePaint(wrap(`${BOX}/>`))).toBe('#000000')
    expect(monochromePaint(wrap(`${BOX} fill="#000000"/><circle r="1"/>`))).toBe('#000000')
  })

  test('inherits a group fill rather than counting it as black', () => {
    expect(monochromePaint(wrap(`<g fill="#111111">${BOX}/></g>`))).toBe('#111111')
  })

  test('ignores fill="none" but counts stroke', () => {
    expect(monochromePaint(wrap(`${BOX} fill="none" stroke="#111111"/>`))).toBe('#111111')
  })

  test('refuses more than one color', () => {
    expect(
      monochromePaint(wrap(`${BOX} fill="#111111"/><circle r="1" fill="#EEEEEE"/>`)),
    ).toBeNull()
  })

  test('refuses currentColor, gradients, and stylesheets', () => {
    expect(monochromePaint(wrap(`${BOX} fill="currentColor"/>`))).toBeNull()
    expect(monochromePaint(wrap(`${BOX} fill="url(#g)"/>`))).toBeNull()
    expect(monochromePaint(wrap(`<style>path{fill:red}</style>${BOX}/>`))).toBeNull()
  })
})

describe('recolor', () => {
  test('rewrites attribute paints', () => {
    const out = recolor(wrap(`${BOX} fill="#111111" stroke="#111111"/>`), '#FF0000')
    expect(out).toContain('fill="#FF0000"')
    expect(out).toContain('stroke="#FF0000"')
    expect(out).not.toContain('#111111')
  })

  test('rewrites style declarations and leaves other properties alone', () => {
    const out = recolor(wrap(`${BOX} style="fill:#111111;opacity:0.5"/>`), '#FF0000')
    expect(out).toContain('fill:#FF0000')
    expect(out).toContain('opacity:0.5')
  })

  test('gives an implicitly black element an explicit fill', () => {
    expect(recolor(wrap(`${BOX}/>`), '#FF0000')).toContain('fill="#FF0000"')
  })

  test('leaves fill="none" unpainted', () => {
    const out = recolor(wrap(`${BOX} fill="none" stroke="#111111"/>`), '#FF0000')
    expect(out).toContain('fill="none"')
    expect(out).toContain('stroke="#FF0000"')
  })

  test('does not paint a child of a fill="none" group', () => {
    expect(recolor(wrap(`<g fill="none">${BOX}/></g>`), '#FF0000')).not.toContain('fill="#FF0000"')
  })

  test('round-trips: a recolored mark is monochrome in the new color', () => {
    const out = recolor(wrap(`${BOX} fill="#111111"/><circle r="1"/>`), '#FF0000')
    expect(monochromePaint(out)).toBe('#ff0000')
  })
})
