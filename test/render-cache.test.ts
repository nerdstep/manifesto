import { describe, expect, test } from 'bun:test'

import { createRenderCache } from '../src/bun/render-cache.ts'
import type { RenderedMark, RenderSettings } from '../src/pipeline/index.ts'

const RENDER: RenderSettings = { iconBackground: '#FFFFFF', optimizeSvg: true }

function counting() {
  let calls = 0
  const render = (sourceSvg: string, darkSvg: string | null): RenderedMark => {
    calls += 1
    return {
      files: new Map([['icon-192.png', new Uint8Array([calls])]]),
      advisories: [],
      sourceHash: `${sourceSvg}/${darkSvg ?? ''}`,
      originalBytes: 0,
      optimizedBytes: 0,
    }
  }
  return { render, calls: () => calls }
}

describe('createRenderCache', () => {
  test('renders once for repeated identical input', () => {
    const stub = counting()
    const cached = createRenderCache(stub.render)

    const first = cached('<svg/>', null, RENDER)
    const second = cached('<svg/>', null, RENDER)

    expect(stub.calls()).toBe(1)
    // Object identity confirms that metadata edits skip rendering.
    expect(second).toBe(first)
  })

  test('re-renders when anything that moves pixels changes', () => {
    const stub = counting()
    const cached = createRenderCache(stub.render)

    cached('<svg/>', null, RENDER)
    cached('<svg id="b"/>', null, RENDER)
    cached('<svg id="b"/>', '<svg id="dark"/>', RENDER)
    cached('<svg id="b"/>', '<svg id="dark"/>', { ...RENDER, iconBackground: '#111111' })
    cached('<svg id="b"/>', '<svg id="dark"/>', {
      iconBackground: '#111111',
      optimizeSvg: false,
    })

    expect(stub.calls()).toBe(5)
  })

  test('removing the Dark Mark is a change, not a return to the same state', () => {
    const stub = counting()
    const cached = createRenderCache(stub.render)

    cached('<svg/>', '<svg id="dark"/>', RENDER)
    cached('<svg/>', null, RENDER)

    expect(stub.calls()).toBe(2)
  })

  test('re-renders a Color Pair edit that leaves Icon Background alone', () => {
    // Light paints the mark in `surface` on `mark`, so editing the color the
    // light Renditions actually use never moves Icon Background.
    const stub = counting()
    const cached = createRenderCache(stub.render)
    const recolored: RenderSettings = {
      ...RENDER,
      colorPair: { mark: '#FFFFFF', surface: '#111111' },
      primaryScheme: 'light',
    }

    cached('<svg/>', null, recolored)
    cached('<svg/>', null, { ...recolored, colorPair: { mark: '#FFFFFF', surface: '#0000FF' } })
    cached('<svg/>', null, { ...recolored, primaryScheme: 'dark' })

    expect(stub.calls()).toBe(3)
  })

  test('holds one entry, so alternating inputs always render', () => {
    // Retain only the active source's rendered bytes.
    const stub = counting()
    const cached = createRenderCache(stub.render)

    cached('<svg id="a"/>', null, RENDER)
    cached('<svg id="b"/>', null, RENDER)
    cached('<svg id="a"/>', null, RENDER)

    expect(stub.calls()).toBe(3)
  })

  test('invalidates when remembered recolor is toggled or corners change', () => {
    const stub = counting()
    const cached = createRenderCache(stub.render)
    const settings: RenderSettings = {
      ...RENDER,
      colorPair: { mark: '#FFFFFF', surface: '#111111' },
    }
    const square = cached('<svg/>', null, settings)
    expect(
      cached('<svg/>', null, { ...settings, recolorEnabled: true, roundedCorners: false }),
    ).toBe(square)
    cached('<svg/>', null, { ...settings, roundedCorners: true })
    cached('<svg/>', null, { ...settings, roundedCorners: true, recolorEnabled: false })
    cached('<svg/>', null, { ...settings, roundedCorners: true, recolorEnabled: true })
    expect(stub.calls()).toBe(4)
  })
})
