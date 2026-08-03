/**
 * The render/metadata seam.
 *
 * The panel sends edits immediately, so it must know which edits require
 * rasterizing. That knowledge is a type — `RenderSettings` vs `ManifestSettings` — and
 * these tests are what make the split true rather than merely declared.
 *
 * The load-bearing assertion is that a metadata change produces byte-identical Renditions.
 * If that ever stops holding, the panel is silently re-rendering on every keystroke.
 */

import { beforeAll, describe, expect, test } from 'bun:test'

import type { Pipeline } from '../src/pipeline/index.ts'
import { BUNDLE_FILENAMES } from '../src/pipeline/renditions.ts'
import type { ManifestSettings, RenderSettings } from '../src/pipeline/types.ts'
import { defaultSettings, fixture, parseJsonObject, testPipeline } from './helpers.ts'

let pipeline: Pipeline
beforeAll(async () => {
  pipeline = await testPipeline()
})

const renderSettings: RenderSettings = {
  iconBackground: defaultSettings.iconBackground,
  optimizeSvg: defaultSettings.optimizeSvg,
}

const manifestSettings: ManifestSettings = {
  name: 'Acme',
  shortName: 'Acme',
  themeColor: '#2E5BFF',
  splashBackground: '#FFFFFF',
}

/** Everything an Asset Bundle contains except the manifest. */
const RENDERED_FILES = [...BUNDLE_FILENAMES].filter((f) => f !== 'site.webmanifest')

describe('render — the expensive half', () => {
  test('produces every file except the manifest', () => {
    const rendered = pipeline.render(fixture('square-tight'), null, renderSettings)
    expect([...rendered.files.keys()].toSorted()).toEqual(RENDERED_FILES.toSorted())
    expect(rendered.files.has('site.webmanifest')).toBe(false)
  })

  test('carries the advisories, which are all render-derived', () => {
    // wordmark, text elements, scripts removed, SVGO drift — every advisory comes from
    // the render pass, so none of them can change on a metadata edit.
    const rendered = pipeline.render(fixture('wordmark'), null, renderSettings)
    expect(rendered.advisories.some((a) => a.kind === 'wordmark')).toBe(true)
  })
})

describe('withManifest — the cheap half', () => {
  test('completes the bundle', () => {
    const rendered = pipeline.render(fixture('square-tight'), null, renderSettings)
    const bundle = pipeline.withManifest(rendered, manifestSettings)

    expect([...bundle.files.keys()].toSorted()).toEqual([...BUNDLE_FILENAMES].toSorted())
  })

  test('does not mutate the rendered half', () => {
    // One RenderedMark is completed repeatedly as the user types. If this mutated, the
    // second edit would be building on the first one's output.
    const rendered = pipeline.render(fixture('square-tight'), null, renderSettings)
    pipeline.withManifest(rendered, manifestSettings)

    expect(rendered.files.has('site.webmanifest')).toBe(false)
    expect([...rendered.files.keys()].toSorted()).toEqual(RENDERED_FILES.toSorted())
  })

  test('writes the manifest it was given, not the one render saw', () => {
    const rendered = pipeline.render(fixture('square-tight'), null, renderSettings)
    const bundle = pipeline.withManifest(rendered, { ...manifestSettings, name: 'Northwind' })

    const manifest = new TextDecoder().decode(bundle.files.get('site.webmanifest'))
    expect(parseJsonObject(manifest)).toMatchObject({ name: 'Northwind' })
  })
})

describe('the seam holds', () => {
  test('a metadata edit changes nothing but the manifest — byte for byte', () => {
    // This is the whole point. If it fails, rapid metadata edits are re-rasterizing on
    // every keystroke and nobody would notice except by feel.
    const rendered = pipeline.render(fixture('multicolor'), null, renderSettings)

    const before = pipeline.withManifest(rendered, manifestSettings)
    const after = pipeline.withManifest(rendered, {
      ...manifestSettings,
      name: 'Something Else Entirely',
      themeColor: '#FF00FF',
      splashBackground: '#101010',
    })

    for (const filename of RENDERED_FILES) {
      expect(after.files.get(filename), `${filename} changed on a metadata edit`).toEqual(
        before.files.get(filename),
      )
    }

    expect(after.files.get('site.webmanifest')).not.toEqual(before.files.get('site.webmanifest'))
  })

  test('a pixel-affecting edit does change the Renditions', () => {
    // The converse. If this passed trivially, the partition would be putting things on
    // the cheap side that belong on the expensive one.
    const source = fixture('square-tight')

    const onWhite = pipeline.render(source, null, { ...renderSettings, iconBackground: '#FFFFFF' })
    const onBlack = pipeline.render(source, null, { ...renderSettings, iconBackground: '#111111' })

    expect(onBlack.files.get('apple-touch-icon.png')).not.toEqual(
      onWhite.files.get('apple-touch-icon.png'),
    )
  })

  test('optimizeSvg is on the pixel-affecting side, and belongs there', () => {
    // docs/design-v1.md once listed only Icon Background and Dark Mark as pixel-affecting.
    // `optimizeSvg` feeds SVGO and changes favicon.svg's bytes, so it is a render input.
    const source = fixture('square-padded')

    const optimized = pipeline.render(source, null, { ...renderSettings, optimizeSvg: true })
    const raw = pipeline.render(source, null, { ...renderSettings, optimizeSvg: false })

    expect(raw.files.get('favicon.svg')).not.toEqual(optimized.files.get('favicon.svg'))
    expect(raw.optimizedBytes).toBeGreaterThan(optimized.optimizedBytes)
  })

  test('the Dark Mark is a render input too', () => {
    // It is a separate argument rather than a settings field, which is easy to forget
    // when reasoning about what forces a re-render.
    const onDark: RenderSettings = { ...renderSettings, iconBackground: '#111111' }

    const without = pipeline.render(fixture('square-tight'), null, onDark)
    const withDark = pipeline.render(fixture('square-tight'), fixture('light-mark'), onDark)

    expect(withDark.files.get('apple-touch-icon.png')).not.toEqual(
      without.files.get('apple-touch-icon.png'),
    )
  })
})

describe('buildBundle is exactly the two halves', () => {
  test('one-shot equals render then withManifest', () => {
    const source = fixture('multicolor')

    const oneShot = pipeline.buildBundle(source, null, defaultSettings)
    const twoStep = pipeline.withManifest(
      pipeline.render(source, null, defaultSettings),
      defaultSettings,
    )

    expect([...twoStep.files.keys()].toSorted()).toEqual([...oneShot.files.keys()].toSorted())
    for (const [filename, bytes] of oneShot.files) {
      expect(twoStep.files.get(filename), filename).toEqual(bytes)
    }
    expect(twoStep.advisories).toEqual(oneShot.advisories)
    expect(twoStep.sourceHash).toBe(oneShot.sourceHash)
  })
})
