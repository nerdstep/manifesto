/** What the source preview sits on, before anything has been rendered. */

import { describe, expect, test } from 'bun:test'

import { sourceBackdrop } from '../src/webview/source-backdrop.ts'

describe('sourceBackdrop', () => {
  test('lifts a dark mark off the Ground it would disappear into', () => {
    expect(sourceBackdrop('#000000', null)).toBe('light')
    expect(sourceBackdrop('#111111', null)).toBe('light')
  })

  test('keeps a light mark on the Ground, which it already reads against', () => {
    expect(sourceBackdrop('#FFFFFF', null)).toBe('ground')
    expect(sourceBackdrop('#1BD6FD', null)).toBe('ground')
  })

  test('prefers the mark to inference when it has both', () => {
    expect(sourceBackdrop('#000000', '#111111')).toBe('light')
  })

  test('falls back to inference, which answers the same question by contrast', () => {
    // A light Icon Background means inference measured a dark mark.
    expect(sourceBackdrop(null, '#FFFFFF')).toBe('light')
    expect(sourceBackdrop(null, '#111111')).toBe('ground')
  })

  test('opens on the Ground while both answers are still missing', () => {
    expect(sourceBackdrop(null, null)).toBe('ground')
  })
})
