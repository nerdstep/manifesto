/**
 * Find where the mark actually is, so every Rendition is built from the same starting
 * point regardless of how the SVG was exported.
 *
 * ## Use the alpha channel, never `getBBox()`
 *
 * resvg's `getBBox()` reports the LAYOUT box. Six element classes inflate it while
 * painting nothing: unresolvable `<image>`, `fill="none"`, `opacity="0"`,
 * `fill-opacity="0"`, `visibility="hidden"`, `fill="transparent"`. Figma and Illustrator
 * routinely emit exactly such a rect to lock an export frame — which is precisely the
 * padded export this stage exists to correct.
 *
 * Measured cost of getting it wrong: a mark rendering at 13.4% of a Rendition instead of
 * 80.6%, silently. See `docs/phase-0-findings.md`.
 *
 * So: render a probe, scan alpha for extents, express them in document viewport pixels.
 * ~7.7 ms, once per Source Mark rather than once per Rendition.
 *
 * ## The nestable form
 *
 * Composition nests the mark as an intact `<svg>` element, which needs explicit
 * `width`/`height` so its viewport is sized in document pixels rather than inheriting
 * the canonical canvas. That edit is made through SVGO's AST — not by regex on the root
 * tag, which breaks on any attribute value containing `>`.
 *
 * It deliberately does NOT round-trip through `Resvg.toString()`: that serializer emits
 * `xlink:href` without declaring the namespace, so its own output fails to re-parse for
 * any mark containing an `<image>`.
 */

import { optimize as runSvgo } from 'svgo/browser'
import type { CustomPlugin } from 'svgo/browser'

import { documentSize, rasterizeToPixels } from './rasterize.ts'
import { PROBE_SIZE, WORDMARK_ASPECT_THRESHOLD } from './renditions.ts'
import type { MarkGeometry } from './types.ts'
import { EmptyMarkError } from './types.ts'

export type NormalizedMark = MarkGeometry & {
  /** The mark as a nestable `<svg>` element, sized in document pixels. */
  nestable: string
  /** Document viewport size — the coordinate space measurements are expressed in. */
  docWidth: number
  docHeight: number
  /** `width / height` of the painted extents. */
  aspectRatio: number
}

/** Sets `x`/`y`/`width`/`height` on the root `<svg>` so it can be nested. */
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

/**
 * Measure a mark from its rendered alpha channel, in the document's own viewport pixels.
 *
 * Returns `null` when nothing is painted — which covers an empty document, a mark made
 * only of `<text>` (resvg renders text blank without font buffers), and a mark made only
 * of invisible geometry. One guard, three failure modes.
 *
 * Two passes over the probe: the first finds the bounding box, the second measures the
 * furthest painted pixel from its centre. The second pass is what makes a circular Safe
 * Zone expressible — a bounding box says nothing about whether the corners are painted.
 */
export function measureMark(svg: string): MarkGeometry | null {
  const { width: docWidth, height: docHeight } = documentSize(svg)
  const probe = rasterizeToPixels(svg, PROBE_SIZE)
  const isPainted = (x: number, y: number): boolean =>
    // `?? 0` reads correctly here as well as satisfying the index check:
    // no pixel is not painted.
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

  // Furthest painted pixel from the bounding box centre, measured in document units so
  // it stays comparable with `extent`. Scanning only the box is enough — nothing
  // outside it is painted, by definition.
  const centreX = (minX + maxX + 1) / 2
  const centreY = (minY + maxY + 1) / 2
  let maxRadiusSquared = 0

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!isPainted(x, y)) continue
      // Measure to the far corner of the pixel: a painted pixel occupies area, and
      // under-measuring here is what lets a mark escape the Safe Zone.
      const dx = (Math.abs(x + 0.5 - centreX) + 0.5) * scaleX
      const dy = (Math.abs(y + 0.5 - centreY) + 0.5) * scaleY
      const radiusSquared = dx * dx + dy * dy
      if (radiusSquared > maxRadiusSquared) maxRadiusSquared = radiusSquared
    }
  }

  return { extent, maxRadius: Math.sqrt(maxRadiusSquared) }
}

/** True when the mark is too elongated to read as a square icon, either way round. */
export function isWordmark(aspectRatio: number): boolean {
  return Math.max(aspectRatio, 1 / aspectRatio) > WORDMARK_ASPECT_THRESHOLD
}

/** @throws {EmptyMarkError} when the mark paints nothing renderable. */
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
