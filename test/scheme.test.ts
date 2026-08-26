/** Recolor's effect on a whole Asset Bundle (ADR 0003, ADR 0004). */

import { beforeAll, describe, expect, test } from 'bun:test'

import type { Pipeline, Settings } from '../src/pipeline/index.ts'
import {
  canRecolor,
  ICO_MEMBERS,
  OPAQUE_INSET,
  PNG_RENDITIONS,
  renditionBackground,
  renditionFit,
  resolveScheme,
  SINGLE_SCHEME_FILENAMES,
} from '../src/pipeline/index.ts'
import { ALL_BUNDLE_FILENAMES, iconFilenames, MANIFEST_FILENAME } from '../src/shared/bundle.ts'
import { defaultSettings, fixture, testPipeline } from './helpers.ts'

const PAIR = { mark: '#F4F6F8', surface: '#101418' } as const

const recolored: Settings = { ...defaultSettings, colorPair: PAIR, primaryScheme: 'dark' }

const backdrop = (fill: string) => `<rect width="1000" height="1000" fill="${fill}"/>`

let pipeline: Pipeline
beforeAll(async () => {
  pipeline = await testPipeline()
})

const build = (
  name: Parameters<typeof fixture>[0],
  settings: Settings,
  dark: string | null = null,
) => pipeline.buildBundle(fixture(name), dark, settings)

describe('recolor eligibility', () => {
  test('a monochrome Source Mark with no Dark Mark qualifies', () => {
    expect(canRecolor(fixture('monochrome'), null)).toBe(true)
  })

  test('a supplied Dark Mark disqualifies it, and clearing it restores eligibility', () => {
    expect(canRecolor(fixture('monochrome'), fixture('light-mark'))).toBe(false)
    expect(canRecolor(fixture('monochrome'), null)).toBe(true)
  })

  test('a multicolor Source Mark never qualifies', () => {
    expect(canRecolor(fixture('multicolor'), null)).toBe(false)
  })
})

describe('resolveScheme', () => {
  test('is inert without a Color Pair', () => {
    const scheme = resolveScheme(fixture('monochrome'), null, defaultSettings)
    expect(scheme).toMatchObject({ dark: null, opaque: false, derived: false })
    expect(scheme.light).toBe(fixture('monochrome'))
    expect(scheme.iconBackground).toBe(defaultSettings.iconBackground)
  })

  test('paints the dark scheme as mark-on-surface and the light scheme as the swap', () => {
    const scheme = resolveScheme(fixture('monochrome'), null, recolored)
    expect(scheme.dark).toContain(PAIR.mark)
    expect(scheme.light).toContain(PAIR.surface)
    expect(scheme.derived).toBe(true)
  })

  test('the Primary Scheme chooses which surface becomes Icon Background', () => {
    expect(resolveScheme(fixture('monochrome'), null, recolored).iconBackground).toBe(PAIR.surface)
    expect(
      resolveScheme(fixture('monochrome'), null, { ...recolored, primaryScheme: 'light' })
        .iconBackground,
    ).toBe(PAIR.mark)
  })

  test('a supplied Dark Mark wins over the Color Pair', () => {
    const scheme = resolveScheme(fixture('monochrome'), fixture('light-mark'), recolored)
    expect(scheme.dark).toBe(fixture('light-mark'))
    expect(scheme.derived).toBe(false)
    expect(scheme.opaque).toBe(false)
  })

  test('a Color Pair on an ineligible mark changes nothing', () => {
    expect(resolveScheme(fixture('multicolor'), null, recolored).opaque).toBe(false)
  })
})

describe('resolveSettings', () => {
  test('an active Color Pair owns Icon Background', () => {
    const settings = pipeline.resolveSettings(fixture('monochrome'), null, recolored)
    expect(settings.iconBackground).toBe(PAIR.surface)
    expect(
      pipeline.resolveSettings(fixture('monochrome'), null, {
        ...recolored,
        primaryScheme: 'light',
      }).iconBackground,
    ).toBe(PAIR.mark)
  })

  test('leaves Icon Background alone when recolor is off', () => {
    expect(pipeline.resolveSettings(fixture('monochrome'), null, defaultSettings)).toBe(
      defaultSettings,
    )
  })
})

describe('the offered Color Pair', () => {
  test('seeds the light scheme with what the Bundle already produces', () => {
    // The monochrome fixture paints #111111, so light stays #111111 on white.
    expect(pipeline.colorPairSeed(fixture('monochrome'), null)).toEqual({
      mark: '#FFFFFF',
      surface: '#111111',
    })
  })

  test('is absent for an ineligible or unreadable mark', () => {
    expect(pipeline.colorPairSeed(fixture('multicolor'), null)).toBeNull()
    expect(pipeline.colorPairSeed(fixture('monochrome'), fixture('light-mark'))).toBeNull()
    expect(pipeline.colorPairSeed('<svg>broken', null)).toBeNull()
  })
})

describe('renditionBackground', () => {
  const treatments = [...PNG_RENDITIONS, ...ICO_MEMBERS].map((spec) => spec.treatment)

  test('leaves transparent Renditions transparent when recolor is off', () => {
    const transparent = treatments.filter((t) => t.background === null)
    expect(transparent.length).toBeGreaterThan(0)
    for (const treatment of transparent) {
      expect(renditionBackground(treatment, '#FFFFFF', false)).toBeNull()
    }
  })

  test('makes every Rendition opaque when recolor is on', () => {
    for (const treatment of treatments) {
      expect(renditionBackground(treatment, '#101418', true)).toBe('#101418')
    }
  })
})

describe('renditionFit', () => {
  const treatments = [...PNG_RENDITIONS, ...ICO_MEMBERS].map((spec) => spec.treatment)

  test('leaves every fit alone while the Renditions stay transparent', () => {
    for (const treatment of treatments) {
      expect(renditionFit(treatment, false)).toEqual(treatment.fit)
    }
  })

  test('gives a full-bleed Rendition a margin once it is opaque', () => {
    const fullBleed = treatments.filter(
      (treatment) => treatment.fit.mode === 'box' && treatment.fit.inset === 0,
    )
    expect(fullBleed.length).toBeGreaterThan(0)
    for (const treatment of fullBleed) {
      expect(renditionFit(treatment, true)).toEqual({ mode: 'box', inset: OPAQUE_INSET })
    }
  })

  test('never shrinks a margin a Rendition already reserves', () => {
    for (const treatment of treatments) {
      const fit = renditionFit(treatment, true)
      if (treatment.fit.mode === 'circle') {
        expect(fit).toEqual(treatment.fit)
      } else {
        expect(fit.mode === 'box' && fit.inset).toBeGreaterThanOrEqual(treatment.fit.inset)
      }
    }
  })
})

describe('the Asset Bundle', () => {
  test('is byte-identical when no Color Pair is set', () => {
    const before = build('monochrome', defaultSettings)
    const after = build('monochrome', { ...defaultSettings, colorPair: null })
    expect([...after.files.keys()]).toEqual([...before.files.keys()])
    expect(after.files.keys()).not.toContain(SINGLE_SCHEME_FILENAMES[0])
  })

  test('gains the single-scheme SVGs once two marks exist', () => {
    const files = [...build('monochrome', recolored).files.keys()]
    for (const filename of SINGLE_SCHEME_FILENAMES) {
      expect(files).toContain(filename)
    }
  })

  test('writes no single-scheme SVGs for a Bundle with one mark', () => {
    const files = [...build('multicolor', recolored).files.keys()]
    for (const filename of SINGLE_SCHEME_FILENAMES) {
      expect(files).not.toContain(filename)
    }
  })

  test('a recolored single-scheme SVG carries the surface it was painted for', () => {
    // These go where nothing switches scheme, so each must stand on its own.
    const files = build('monochrome', recolored).files
    const read = (name: string) => new TextDecoder().decode(files.get(name))

    expect(read('favicon-light.svg')).toContain(`fill="${PAIR.mark}"`)
    expect(read('favicon-dark.svg')).toContain(`fill="${PAIR.surface}"`)
  })

  test('the dual favicon brings a surface into each half', () => {
    // One surface per scheme group, so whichever half the visitor gets is a
    // tile — the same tile `favicon.ico` already is.
    const svg = new TextDecoder().decode(build('monochrome', recolored).files.get('favicon.svg'))

    expect(svg).toContain(`class="mfo-light">${backdrop(PAIR.mark)}`)
    expect(svg).toContain(`class="mfo-dark">${backdrop(PAIR.surface)}`)
    // The scheme switch is what this file is for; it survives the surfaces.
    expect(svg).toContain('prefers-color-scheme')
  })

  test('a supplied Dark Mark leaves the dual favicon transparent', () => {
    const files = build('monochrome', defaultSettings, fixture('light-mark')).files
    expect(new TextDecoder().decode(files.get('favicon.svg'))).not.toContain('<rect')
  })

  test('a supplied Dark Mark leaves the single-scheme SVGs transparent', () => {
    // Recolor is off, so neither mark was painted for a surface of ours.
    const files = build('monochrome', defaultSettings, fixture('light-mark')).files
    const read = (name: string) => new TextDecoder().decode(files.get(name))

    for (const filename of SINGLE_SCHEME_FILENAMES) {
      expect(read(filename)).not.toContain('<rect')
    }
  })

  test('the two single-scheme SVGs are never identical', () => {
    const files = build('monochrome', recolored).files
    const read = (name: string) => new TextDecoder().decode(files.get(name))
    expect(read('favicon-light.svg')).not.toBe(read('favicon-dark.svg'))
  })

  test('the Primary Scheme changes every raster', () => {
    const onDark = build('monochrome', recolored).files
    const onLight = build('monochrome', { ...recolored, primaryScheme: 'light' }).files

    for (const filename of ['favicon.ico', 'icon-192.png', 'icon-512.png']) {
      expect(onDark.get(filename), filename).not.toEqual(onLight.get(filename))
    }
    // favicon.svg carries both schemes, so the Primary Scheme cannot reach it.
    expect(onDark.get('favicon.svg')).toEqual(onLight.get('favicon.svg'))
  })

  test('reports no duplicate advisories for a Derived Mark', () => {
    const plain = build('wordmark', defaultSettings)
    const derived = build('wordmark', recolored)
    expect(derived.advisories).toHaveLength(plain.advisories.length)
    expect(derived.advisories.every((advisory) => advisory.origin === undefined)).toBe(true)
  })

  test('is listed in full by the names the interface counts from', () => {
    // The build output list and its counts read from these two, so a file the
    // pipeline writes and they do not name would be invisible in the app.
    const written = [...build('monochrome', recolored).files.keys()]

    const listable: string[] = [...ALL_BUNDLE_FILENAMES]
    expect(listable.filter((name) => written.includes(name)).toSorted()).toEqual(written.toSorted())
    expect(iconFilenames(true)).toHaveLength(
      written.filter((name) => name !== MANIFEST_FILENAME).length,
    )
    expect(iconFilenames(false)).toHaveLength(
      [...build('monochrome', defaultSettings).files.keys()].filter(
        (name) => name !== MANIFEST_FILENAME,
      ).length,
    )
  })

  test('hashes the original Source Mark, not the recolored derivative', () => {
    expect(build('monochrome', recolored).sourceHash).toBe(
      build('monochrome', defaultSettings).sourceHash,
    )
  })
})
