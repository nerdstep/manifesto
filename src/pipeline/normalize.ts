/** Measure painted pixels instead of layout bounds so exported padding is ignored. */

import { optimize as runSvgo } from 'svgo/browser'
import type { CustomPlugin } from 'svgo/browser'

import { documentSize, rasterizeToPixels } from './rasterize.ts'
import { PROBE_SIZE, WORDMARK_ASPECT_THRESHOLD } from './renditions.ts'
import type { MarkGeometry } from './types.ts'
import { EmptyMarkError } from './types.ts'

export type NormalizedMark = MarkGeometry & {
  nestable: string
  docWidth: number
  docHeight: number
  aspectRatio: number
}

function sizeRoot(width: number, height: number): CustomPlugin {
  return {
    name: 'manifesto-size-root',
    fn: () => ({
      element: {
        enter: (node, parentNode) => {
          if (parentNode.type !== 'root' || node.name !== 'svg') return
          node.attributes.x = '0'
          node.attributes.y = '0'
          node.attributes.width = String(width)
          node.attributes.height = String(height)
        },
      },
    }),
  }
}

export function measureMark(svg: string): MarkGeometry | null {
  const { width: docWidth, height: docHeight } = documentSize(svg)
  const probe = rasterizeToPixels(svg, PROBE_SIZE)
  const isPainted = (x: number, y: number): boolean =>
    (probe.pixels[(y * probe.width + x) * 4 + 3] ?? 0) !== 0

  let minX = probe.width
  let minY = probe.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < probe.height; y += 1) {
    for (let x = 0; x < probe.width; x += 1) {
      if (!isPainted(x, y)) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0) return null

  const scaleX = docWidth / probe.width
  const scaleY = docHeight / probe.height

  const extent = {
    x: minX * scaleX,
    y: minY * scaleY,
    w: (maxX - minX + 1) * scaleX,
    h: (maxY - minY + 1) * scaleY,
  }

  // Measure the furthest painted pixel for circular safe-zone fitting.
  const centreX = (minX + maxX + 1) / 2
  const centreY = (minY + maxY + 1) / 2
  let maxRadiusSquared = 0

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!isPainted(x, y)) continue
      // Include the full pixel area when measuring its radius.
      const dx = (Math.abs(x + 0.5 - centreX) + 0.5) * scaleX
      const dy = (Math.abs(y + 0.5 - centreY) + 0.5) * scaleY
      const radiusSquared = dx * dx + dy * dy
      if (radiusSquared > maxRadiusSquared) maxRadiusSquared = radiusSquared
    }
  }

  return { extent, maxRadius: Math.sqrt(maxRadiusSquared) }
}

export function isWordmark(aspectRatio: number): boolean {
  return Math.max(aspectRatio, 1 / aspectRatio) > WORDMARK_ASPECT_THRESHOLD
}

export function normalize(svg: string): NormalizedMark {
  const geometry = measureMark(svg)
  if (geometry === null) throw new EmptyMarkError()

  const { width: docWidth, height: docHeight } = documentSize(svg)

  const nestable = runSvgo(svg, {
    plugins: ['removeDoctype', 'removeXMLProcInst', sizeRoot(docWidth, docHeight)],
    js2svg: { pretty: false },
  }).data

  return {
    ...geometry,
    nestable,
    docWidth,
    docHeight,
    aspectRatio: geometry.extent.w / geometry.extent.h,
  }
}
