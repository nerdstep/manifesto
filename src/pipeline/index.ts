/**
 * The Asset Bundle pipeline.
 *
 * This module and everything it imports must stay free of `node:fs`, `bun`, Electrobun,
 * and anything under `src/bun` or `src/webview`. `test/pipeline-purity.test.ts` enforces
 * it, because the whole test strategy depends on it: this app's output is pixels, and a
 * 4px Safe Zone error looks fine in a preview while clipping someone's logo on a Pixel.
 * Fixtures plus golden hashes catch that — but only if the pipeline runs headless.
 *
 * ## Getting a pipeline
 *
 * Everything that rasterizes is reachable only through `createPipeline()`:
 *
 * ```ts
 * const pipeline = await createPipeline(wasmBytes)
 * pipeline.buildBundle(sourceSvg, null, settings)
 * ```
 *
 * You cannot obtain `buildBundle` without having awaited initialisation, so "call this
 * first" is unrepresentable rather than merely documented. The caller supplies the WASM
 * bytes; that is how this stays free of `fs`.
 *
 * The purely computational parts — `compose`, `validate`, `optimize`, the manifest and
 * ICO builders — are ordinary exports, because they need no rasterizer.
 */

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

// --- pure surface: no rasterizer, safe to import directly --------------------
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
// `pixelDriftPercent` is deliberately NOT re-exported: it rasterizes, so it is reachable
// only through `createPipeline()`. `test/pipeline-purity.test.ts` enforces that.
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

/** Content hash of a Source Mark, for the Sidecar's collision guard. */
export function hashSource(svg: string): string {
  return createHash('sha256').update(svg, 'utf8').digest('hex')
}

/** Prepare a mark: sanitize, optionally optimize, then Normalize. */
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

/**
 * Render every PNG Rendition, plus the ICO members.
 *
 * Each is rasterized from its own wrapper document at final dimensions. No image is
 * ever resampled.
 */
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

/**
 * Rasterize a Source Mark — everything in an Asset Bundle except `site.webmanifest`.
 *
 * This is the expensive half. Hold the result across panel edits and a metadata change
 * costs a JSON rewrite instead of six renders.
 *
 * Synchronous: every stage — resvg, SVGO, ico-endec — is synchronous once the WASM is
 * loaded, and loading is `createPipeline()`'s job. There is nothing left to await.
 *
 * @throws {EmptyMarkError} when the mark paints nothing renderable.
 * @throws {InvalidSvgError} when the mark cannot be parsed.
 */
function render(sourceSvg: string, darkSvg: string | null, settings: RenderSettings): RenderedMark {
  const source = prepare(sourceSvg, settings.optimizeSvg)
  const advisories: Advisory[] = markAdvisories(source, settings.optimizeSvg)

  // A Dark Mark is the user's second input, so it gets the same treatment as the first
  // — but its advisories are about a file the panel presents separately, so they are
  // not merged into the Source Mark's list.
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

/**
 * Complete an Asset Bundle by writing `site.webmanifest`.
 *
 * The cheap half, and the only thing that crosses the render/metadata seam. Rendered
 * bytes are reused as-is, never re-rasterized — which keeps repeated metadata edits cheap
 * while the host coalesces colour-picker work.
 *
 * Does not mutate `rendered`, so one `RenderedMark` can be completed repeatedly as the
 * user edits.
 */
function withManifest(rendered: RenderedMark, settings: ManifestSettings): BundleResult {
  const files = new Map<string, Uint8Array>([
    ...rendered.files,
    ['site.webmanifest', encoder.encode(buildWebManifest(settings))],
  ])
  return { ...rendered, files }
}

/**
 * Everything the panel opens with, guessed from the mark and its filename.
 *
 * The whole of inference behind one call: the caller supplies an SVG and a filename and
 * gets a complete `Settings` back, with no obligation to know that names come from string
 * work and colours come from a 64px raster.
 *
 * `optimizeSvg` defaults on. It is the only setting here that is a policy rather than a
 * guess — SVGO is worth having, and the drift advisory plus the panel's toggle are how
 * the user finds out when it was not.
 *
 * @throws {InvalidSvgError} when the mark cannot be parsed.
 */
function inferSettings(sourceSvg: string, filename: string): Settings {
  return {
    ...inferNames(filename),
    ...inferColors(rasterizeToPixels(sourceSvg, INFERENCE_PROBE_SIZE)),
    optimizeSvg: true,
  }
}

/**
 * Build a complete Asset Bundle from a Source Mark — the one-shot form.
 *
 * Exactly `withManifest(render(...), ...)`. Use the two steps directly when you intend
 * to reuse the rendered half.
 */
function buildBundle(sourceSvg: string, darkSvg: string | null, settings: Settings): BundleResult {
  return withManifest(render(sourceSvg, darkSvg, settings), settings)
}

/**
 * Everything that needs a rasterizer.
 *
 * `buildBundle` is the external interface. The rest is this module's **internal seam** —
 * private to the implementation, exposed so the module's own tests can measure geometry
 * and Safe Zone compliance directly. Those tests caught the `inset: 0.2` Safe Zone bug;
 * routing them through `buildBundle` would have hidden it behind six image files.
 */
export type Pipeline = {
  /** The one-shot form: `withManifest(render(...), ...)`. */
  buildBundle(sourceSvg: string, darkSvg: string | null, settings: Settings): BundleResult

  /** The expensive half. Hold the result to make metadata edits cheap. */
  render(sourceSvg: string, darkSvg: string | null, settings: RenderSettings): RenderedMark

  /** The cheap half. Reuses rendered bytes; never rasterizes. */
  withManifest(rendered: RenderedMark, settings: ManifestSettings): BundleResult

  /** What the panel opens with. Rasterizes a small probe to read the mark's colours. */
  inferSettings(sourceSvg: string, filename: string): Settings

  /** @internal */ normalize(svg: string): NormalizedMark
  /** @internal */ measureMark(svg: string): MarkGeometry | null
  /** @internal */ rasterize(svg: string, width: number): Uint8Array
  /** @internal */ rasterizeToPixels(svg: string, longestSide: number): PixelBuffer
  /** @internal */ pixelDriftPercent(before: string, after: string): number
}

/**
 * Initialise resvg and hand back the pipeline.
 *
 * Idempotent: resvg's WASM module is process-global, so repeated calls reuse the first
 * initialisation rather than throwing. Passing different bytes the second time has no
 * effect — there is only ever one rasterizer.
 *
 * @param wasm `@resvg/resvg-wasm`'s `index_bg.wasm`. The pipeline never reads it from
 * disk itself; that is how it stays free of `fs`.
 */
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
