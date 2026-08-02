/**
 * Stage 3 — shrink the Source Mark with SVGO.
 *
 * Real-world logo exports carry 60–80% editor metadata, and `favicon.svg` is fetched on
 * every page load, so this is worth doing.
 *
 * Two SVGO plugins are dangerous for icons. `cleanupIds` is in `preset-default` and is
 * disabled below. `removeViewBox` — the worse of the two — was dropped from
 * `preset-default` in SVGO v4, so it no longer runs; do not add it back, and note that
 * passing it as an override is not a defence either (v4 rejects overrides for plugins
 * outside the preset, so it silently does nothing but log). The real guard is
 * `test/optimize.test.ts`, which asserts `viewBox` survives.
 *
 * `pixelDriftPercent` lives here too: whether optimization broke the artwork is a
 * question about optimization, and keeping it beside the thing it checks means the
 * threshold and the plugin list are read together.
 */

import { optimize as runSvgo } from 'svgo/browser'

import { rasterizeToPixels } from './rasterize.ts'
import { utf8Bytes } from './types.ts'

/**
 * Fraction of pixels that may differ between the original and optimized mark before it
 * is worth telling the user. Below this it is antialiasing; above it, SVGO has changed
 * the artwork.
 */
export const PIXEL_DRIFT_THRESHOLD = 0.1

/** Size the drift check renders at. Large enough to see detail, cheap enough to run. */
const DRIFT_CHECK_SIZE = 512

/**
 * Percentage of pixels that differ between two renders of the same document.
 *
 * SVGO's classic breakages — mangled `<use>`, collided gradient ids, dropped clip paths
 * — all still produce a valid SVG. Only the pixels reveal them, which is why this
 * compares renders rather than markup.
 */
export function pixelDriftPercent(before: string, after: string): number {
  const a = rasterizeToPixels(before, DRIFT_CHECK_SIZE)
  const b = rasterizeToPixels(after, DRIFT_CHECK_SIZE)

  if (a.width !== b.width || a.height !== b.height) return 100

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
  if (!enabled) return { svg, originalBytes, optimizedBytes: originalBytes }

  const { data } = runSvgo(svg, {
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            // Renames and prunes ids. Its classic failure is collapsing two gradients
            // that shared an id after a Figma export, which silently recolours part of
            // the mark. Byte savings are not worth that on a file this small.
            cleanupIds: false,
          },
        },
      },
    ],
  })

  return { svg: data, originalBytes, optimizedBytes: utf8Bytes(data) }
}
