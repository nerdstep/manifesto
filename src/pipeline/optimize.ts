/** Optimize SVG while preserving icon-critical ids and viewBox data. */

import { optimize as runSvgo } from 'svgo/browser'

import { rasterizeToPixels } from './rasterize.ts'
import { utf8Bytes } from './types.ts'

export const PIXEL_DRIFT_THRESHOLD = 0.1

const DRIFT_CHECK_SIZE = 512

/** Compare rendered pixels because broken SVG optimization can remain syntactically valid. */
export function pixelDriftPercent(before: string, after: string): number {
  const a = rasterizeToPixels(before, DRIFT_CHECK_SIZE)
  const b = rasterizeToPixels(after, DRIFT_CHECK_SIZE)

  if (a.width !== b.width || a.height !== b.height) {
    return 100
  }

  let differing = 0
  for (let i = 0; i < a.pixels.length; i += 4) {
    for (let channel = 0; channel < 4; channel += 1) {
      if ((a.pixels[i + channel] ?? 0) !== (b.pixels[i + channel] ?? 0)) {
        differing += 1
        break
      }
    }
  }

  return (differing / (a.pixels.length / 4)) * 100
}

export type OptimizeResult = {
  svg: string
  originalBytes: number
  optimizedBytes: number
}

export function optimize(svg: string, enabled: boolean): OptimizeResult {
  const originalBytes = utf8Bytes(svg)
  if (!enabled) {
    return { svg, originalBytes, optimizedBytes: originalBytes }
  }

  const { data } = runSvgo(svg, {
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            // Preserve author ids because references may depend on them.
            cleanupIds: false,
          },
        },
      },
    ],
  })

  return { svg: data, originalBytes, optimizedBytes: utf8Bytes(data) }
}
