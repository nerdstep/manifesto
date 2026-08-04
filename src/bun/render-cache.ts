import type { RenderedMark, RenderSettings } from '../pipeline/index.ts'

export type RenderFn = (
  sourceSvg: string,
  darkSvg: string | null,
  settings: RenderSettings,
) => RenderedMark

/** Cache the most recent render because the app edits one source at a time. */
export function createRenderCache(render: RenderFn): RenderFn {
  let last: { key: [string, string | null, string, boolean]; value: RenderedMark } | null = null

  return (sourceSvg, darkSvg, settings) => {
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
