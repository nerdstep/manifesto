/**
 * Skip the expensive half when nothing that moves pixels has changed.
 *
 * The panel can send repeated edits during a colour drag, and `render()` costs ~60 ms
 * while `withManifest()` costs 0.007 ms. Typing in the Name field must not spend 40% of the
 * budget re-rendering images that are already correct — and, just as importantly,
 * must not produce *different* bytes for them, which is what makes the incremental
 * property testable at all.
 *
 * `RenderSettings` versus `ManifestSettings` is the partition this relies on, and it is
 * enforced by the type system rather than by care: this module cannot be passed a Name,
 * so it cannot accidentally treat one as pixel-affecting.
 *
 * One entry, not an LRU. The user edits one mark at a time, and holding a second
 * `RenderedMark` would keep megabytes of PNG bytes alive to serve a re-drop that also
 * has to re-read the file anyway.
 */

import type { RenderedMark, RenderSettings } from '../pipeline/index.ts'

export type RenderFn = (
  sourceSvg: string,
  darkSvg: string | null,
  settings: RenderSettings,
) => RenderedMark

/**
 * Wrap a render function so identical inputs are rendered once.
 *
 * The returned function has exactly the interface of the one passed in — callers cannot
 * tell a cache is there, and nothing has to be invalidated by hand. It takes `render` as
 * an argument rather than importing it so its own tests can count calls without a
 * rasterizer.
 */
export function createRenderCache(render: RenderFn): RenderFn {
  let last: { key: [string, string | null, string, boolean]; value: RenderedMark } | null = null

  return (sourceSvg, darkSvg, settings) => {
    // Comparing the SVG source by value rather than hashing it: string equality on a
    // 12 kB document is a memcmp, and cheaper than the SHA-256 the alternative would
    // cost on every single keystroke.
    const key: [string, string | null, string, boolean] = [
      sourceSvg,
      darkSvg,
      settings.iconBackground,
      settings.optimizeSvg,
    ]

    if (last !== null && last.key.every((part, i) => part === key[i])) {
      return last.value
    }

    const value = render(sourceSvg, darkSvg, settings)
    last = { key, value }
    return value
  }
}
