/**
 * The render cache: what a rapidly edited panel is allowed to skip.
 *
 * Tested with a counting stub rather than the real rasterizer. The property being checked
 * is "which changes cause a render", which is entirely about the cache key — running
 * resvg here would add 60 ms per case and prove nothing extra.
 *
 * `test/incremental.test.ts` covers the other half: that reusing a `RenderedMark` really
 * does produce byte-identical files.
 */

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
    // The same object, not an equal one — that identity is what makes the metadata path
    // free rather than merely cheap.
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

  test('holds one entry, so alternating inputs always render', () => {
    // Documented behaviour, not an accident: a second entry would keep megabytes of PNG
    // bytes alive to serve a re-drop that has to re-read the file anyway.
    const stub = counting()
    const cached = createRenderCache(stub.render)

    cached('<svg id="a"/>', null, RENDER)
    cached('<svg id="b"/>', null, RENDER)
    cached('<svg id="a"/>', null, RENDER)

    expect(stub.calls()).toBe(3)
  })
})
