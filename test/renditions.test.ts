/**
 * The Rendition table encodes platform requirements, not preferences. These tests are
 * here so a future "tidy-up" cannot quietly break iOS or Android.
 */

import { describe, expect, test } from 'bun:test'

import {
  BUNDLE_FILENAMES,
  ICO_MEMBER_SIZES,
  PNG_RENDITIONS,
  SAFE_ZONE_DIAMETER,
} from '../src/pipeline/renditions.ts'

describe('rendition table', () => {
  test('the Asset Bundle is the seven-file Modern Minimal Set', () => {
    expect([...BUNDLE_FILENAMES]).toEqual([
      'favicon.ico',
      'favicon.svg',
      'apple-touch-icon.png',
      'icon-192.png',
      'icon-512.png',
      'icon-maskable-512.png',
      'site.webmanifest',
    ])
  })

  test('no legacy platform files', () => {
    const joined = BUNDLE_FILENAMES.join(' ')
    for (const dead of ['mstile', 'browserconfig', 'android-chrome', 'precomposed']) {
      expect(joined).not.toContain(dead)
    }
  })

  test('favicon.ico packs 16, 32 and 48', () => {
    expect([...ICO_MEMBER_SIZES]).toEqual([16, 32, 48])
  })

  test('apple-touch-icon is opaque — iOS composites transparency onto black', () => {
    const apple = PNG_RENDITIONS.find((r) => r.filename === 'apple-touch-icon.png')
    expect(apple?.treatment.background).toBe('iconBackground')
    expect(apple?.treatment.size).toBe(180)
  })

  test('the maskable icon is opaque and fitted to the Safe Zone circle', () => {
    const maskable = PNG_RENDITIONS.find((r) => r.filename === 'icon-maskable-512.png')
    expect(maskable?.treatment.background).toBe('iconBackground')
    // Must be a circle fit, not a box inset. A box of side 0.6 has a half-diagonal of
    // 0.424 against a safe radius of 0.4, so any mark painting into its own corners is
    // clipped — measured at 217.1 vs 204.8 on the staircase fixture.
    expect(maskable?.treatment.fit).toEqual({ mode: 'circle', diameter: SAFE_ZONE_DIAMETER })
  })

  test('only the maskable icon uses a circle fit', () => {
    // Every other target masks with a square or rounded rect, where a circle fit would
    // shrink the mark for no reason.
    const circles = PNG_RENDITIONS.filter((r) => r.treatment.fit.mode === 'circle')
    expect(circles.map((r) => r.filename)).toEqual(['icon-maskable-512.png'])
  })

  test('"any" icons stay transparent and full bleed', () => {
    for (const name of ['icon-192.png', 'icon-512.png']) {
      const r = PNG_RENDITIONS.find((x) => x.filename === name)
      expect(r?.treatment.background).toBeNull()
      expect(r?.treatment.fit).toEqual({ mode: 'box', inset: 0 })
    }
  })

  test('there are separate any and maskable files at 512', () => {
    // "purpose: any maskable" on one file is an anti-pattern: the maskable padding
    // survives into any slots and the logo renders 20% smaller than its neighbours.
    const at512 = PNG_RENDITIONS.filter((r) => r.treatment.size === 512)
    expect(at512).toHaveLength(2)
    expect(new Set(at512.map((r) => r.treatment.background)).size).toBe(2)
  })
})
