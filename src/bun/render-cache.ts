import { isNil } from 'es-toolkit'

import type { RenderedMark, RenderSettings } from '../pipeline/index.ts'

export type RenderFn = (
  sourceSvg: string,
  darkSvg: string | null,
  settings: RenderSettings,
) => RenderedMark

/**
 * Everything that reaches the rasterizer. A Color Pair edit can leave Icon
 * Background untouched — light's background is the pair's *other* half — so
 * keying on Icon Background alone served a stale Bundle for the color the user
 * had just changed.
 */
function renderKey(sourceSvg: string, darkSvg: string | null, settings: RenderSettings): string {
  const pair = settings.colorPair
  return JSON.stringify([
    sourceSvg,
    darkSvg,
    settings.iconBackground,
    settings.optimizeSvg,
    isNil(pair) ? null : [pair.mark, pair.surface],
    settings.primaryScheme ?? null,
    settings.recolorEnabled ?? !isNil(pair),
    settings.roundedCorners ?? false,
  ])
}

/** Cache the most recent render because the app edits one source at a time. */
export function createRenderCache(render: RenderFn): RenderFn {
  let last: { key: string; value: RenderedMark } | null = null

  return (sourceSvg, darkSvg, settings) => {
    const key = renderKey(sourceSvg, darkSvg, settings)

    if (last !== null && last.key === key) {
      return last.value
    }

    const value = render(sourceSvg, darkSvg, settings)
    last = { key, value }
    return value
  }
}
