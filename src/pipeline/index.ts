/** Keep the pipeline headless and free of filesystem or UI dependencies. */

import { createHash } from 'node:crypto'

import { buildFaviconSvg, buildWebManifest, packIco } from './assemble.ts'
import { compose, markFor } from './compose.ts'
import { inferColors, INFERENCE_PROBE_SIZE, inferNames } from './infer.ts'
import type { NormalizedMark } from './normalize.ts'
import { isWordmark, measureMark, normalize } from './normalize.ts'
import { optimize, PIXEL_DRIFT_THRESHOLD, pixelDriftPercent } from './optimize.ts'
import type { PixelBuffer } from './rasterize.ts'
import { initializeOnce, rasterize, rasterizeToPixels } from './rasterize.ts'
import { ICO_MEMBERS, PNG_RENDITIONS } from './renditions.ts'
import type {
  Advisory,
  AdvisoryOrigin,
  BundleResult,
  Hex,
  ManifestSettings,
  MarkGeometry,
  RenderedMark,
  RenderSettings,
  Settings,
} from './types.ts'
import { validate } from './validate.ts'

export { buildFaviconSvg, buildWebManifest, HEAD_SNIPPET, packIco } from './assemble.ts'
export {
  canvas,
  compose,
  composeInner,
  isDark,
  luminanceOf,
  markFor,
  relativeLuminance,
  scaleFor,
} from './compose.ts'
export type { InferredColors, InferredNames } from './infer.ts'
export { inferColors, INFERENCE_PROBE_SIZE, inferNames } from './infer.ts'
export type { NormalizedMark } from './normalize.ts'
export { isWordmark } from './normalize.ts'
// Rasterizing functions are exposed only through `createPipeline()`.
export { optimize } from './optimize.ts'
export type { PixelBuffer } from './rasterize.ts'
export {
  BUNDLE_FILENAMES,
  FAVICON_DARK_CLASS,
  FAVICON_LIGHT_CLASS,
  FAVICON_SVG_TREATMENT,
  ICO_MEMBER_SIZES,
  ICO_MEMBERS,
  PNG_RENDITIONS,
  SAFE_ZONE_DIAMETER,
  WORDMARK_ASPECT_THRESHOLD,
} from './renditions.ts'
export * from './types.ts'
export { validate } from './validate.ts'

const encoder = new TextEncoder()

export function hashSource(svg: string): string {
  return createHash('sha256').update(svg, 'utf8').digest('hex')
}

function prepare(svg: string, optimizeSvg: boolean) {
  const { sanitized, advisories } = validate(svg)
  const optimized = optimize(sanitized, optimizeSvg)
  return { sanitized, optimized, advisories, mark: normalize(optimized.svg) }
}

function markAdvisories(
  prepared: ReturnType<typeof prepare>,
  optimizeSvg: boolean,
  origin?: AdvisoryOrigin,
): Advisory[] {
  const withOrigin = (advisory: Advisory): Advisory =>
    origin === undefined ? advisory : { ...advisory, origin }
  const advisories = prepared.advisories.map(withOrigin)

  if (isWordmark(prepared.mark.aspectRatio)) {
    advisories.push(withOrigin({ kind: 'wordmark', aspectRatio: prepared.mark.aspectRatio }))
  }

  if (optimizeSvg) {
    const drift = pixelDriftPercent(prepared.sanitized, prepared.optimized.svg)
    if (drift > PIXEL_DRIFT_THRESHOLD) {
      advisories.push(withOrigin({ kind: 'svgo-pixel-drift', percent: drift }))
    }
  }

  return advisories
}

/** Render each output directly at its final dimensions. */
function renderRenditions(
  source: NormalizedMark,
  dark: NormalizedMark | null,
  iconBackground: Hex,
): { files: Map<string, Uint8Array>; icoMembers: Uint8Array[] } {
  const files = new Map<string, Uint8Array>()

  for (const { filename, treatment } of PNG_RENDITIONS) {
    if (filename === null) continue
    const background = treatment.background === null ? null : iconBackground
    const mark = markFor(source, dark, background)
    files.set(filename, rasterize(compose(mark, treatment, background), treatment.size))
  }

  const icoMembers = ICO_MEMBERS.map(({ treatment }) =>
    rasterize(compose(source, treatment, null), treatment.size),
  )

  return { files, icoMembers }
}

/** Render all image files without the web app manifest. */
function render(sourceSvg: string, darkSvg: string | null, settings: RenderSettings): RenderedMark {
  const source = prepare(sourceSvg, settings.optimizeSvg)
  const advisories: Advisory[] = markAdvisories(source, settings.optimizeSvg)

  // Validate and optimize both source files with the same settings.
  let dark: NormalizedMark | null = null
  if (darkSvg !== null) {
    const preparedDark = prepare(darkSvg, settings.optimizeSvg)
    advisories.push(...markAdvisories(preparedDark, settings.optimizeSvg, 'dark'))
    dark = preparedDark.mark
  }

  const { files, icoMembers } = renderRenditions(source.mark, dark, settings.iconBackground)

  files.set('favicon.ico', packIco(icoMembers))
  files.set('favicon.svg', encoder.encode(buildFaviconSvg(source.mark, dark)))

  return {
    files,
    advisories,
    sourceHash: hashSource(sourceSvg),
    originalBytes: source.optimized.originalBytes,
    optimizedBytes: source.optimized.optimizedBytes,
  }
}

/** Add metadata without mutating or rerendering the image files. */
function withManifest(rendered: RenderedMark, settings: ManifestSettings): BundleResult {
  const files = new Map<string, Uint8Array>([
    ...rendered.files,
    ['site.webmanifest', encoder.encode(buildWebManifest(settings))],
  ])
  return { ...rendered, files }
}

function inferSettings(sourceSvg: string, filename: string): Settings {
  return {
    ...inferNames(filename),
    ...inferColors(rasterizeToPixels(sourceSvg, INFERENCE_PROBE_SIZE)),
    optimizeSvg: true,
  }
}

function buildBundle(sourceSvg: string, darkSvg: string | null, settings: Settings): BundleResult {
  return withManifest(render(sourceSvg, darkSvg, settings), settings)
}

export type Pipeline = {
  buildBundle(sourceSvg: string, darkSvg: string | null, settings: Settings): BundleResult

  render(sourceSvg: string, darkSvg: string | null, settings: RenderSettings): RenderedMark

  withManifest(rendered: RenderedMark, settings: ManifestSettings): BundleResult

  inferSettings(sourceSvg: string, filename: string): Settings

  /** @internal */ normalize(svg: string): NormalizedMark
  /** @internal */ measureMark(svg: string): MarkGeometry | null
  /** @internal */ rasterize(svg: string, width: number): Uint8Array
  /** @internal */ rasterizeToPixels(svg: string, longestSide: number): PixelBuffer
  /** @internal */ pixelDriftPercent(before: string, after: string): number
}

/** Initialize process-global resvg state and return the rasterizing API. */
export async function createPipeline(wasm: ArrayBuffer | Uint8Array): Promise<Pipeline> {
  await initializeOnce(wasm)

  return {
    buildBundle,
    render,
    withManifest,
    inferSettings,
    normalize,
    measureMark,
    rasterize,
    rasterizeToPixels,
    pixelDriftPercent,
  }
}
