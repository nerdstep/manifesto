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
import { ICO_MEMBERS, PNG_RENDITIONS, renditionBackground } from './renditions.ts'
import { canRecolor, inferColorPair, resolveScheme } from './scheme.ts'
import type {
  Advisory,
  AdvisoryOrigin,
  BundleResult,
  ColorPair,
  Hex,
  ManifestSettings,
  MarkGeometry,
  RenderedMark,
  RenderSettings,
  Settings,
  Treatment,
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
export type { ResolvedScheme } from './scheme.ts'
export { canRecolor, inferColorPair, monochromePaint, recolor, resolveScheme } from './scheme.ts'
export type { PixelBuffer } from './rasterize.ts'
export {
  BUNDLE_FILENAMES,
  FAVICON_DARK_CLASS,
  FAVICON_LIGHT_CLASS,
  FAVICON_SVG_TREATMENT,
  ICO_MEMBER_SIZES,
  ICO_MEMBERS,
  PNG_RENDITIONS,
  renditionBackground,
  SAFE_ZONE_DIAMETER,
  SINGLE_SCHEME_FILENAMES,
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
  opaque: boolean,
): { files: Map<string, Uint8Array>; icoMembers: Uint8Array[] } {
  const files = new Map<string, Uint8Array>()
  const surfaceFor = (treatment: Treatment): Hex | null =>
    renditionBackground(treatment, iconBackground, opaque)

  for (const { filename, treatment } of PNG_RENDITIONS) {
    if (filename === null) {
      continue
    }
    const background = surfaceFor(treatment)
    const mark = markFor(source, dark, background)
    files.set(filename, rasterize(compose(mark, treatment, background), treatment.size))
  }

  const icoMembers = ICO_MEMBERS.map(({ treatment }) =>
    rasterize(compose(source, treatment, surfaceFor(treatment)), treatment.size),
  )

  return { files, icoMembers }
}

/** Render all image files without the web app manifest. */
function render(sourceSvg: string, darkSvg: string | null, settings: RenderSettings): RenderedMark {
  const scheme = resolveScheme(sourceSvg, darkSvg, settings)
  const source = prepare(scheme.light, settings.optimizeSvg)
  const advisories: Advisory[] = markAdvisories(source, settings.optimizeSvg)

  // Validate and optimize both source files with the same settings.
  let dark: NormalizedMark | null = null
  if (scheme.dark !== null) {
    const preparedDark = prepare(scheme.dark, settings.optimizeSvg)
    // A Derived Mark shares the Source Mark's geometry, so its advisories
    // would only repeat what the Source Mark already reported.
    if (!scheme.derived) {
      advisories.push(...markAdvisories(preparedDark, settings.optimizeSvg, 'dark'))
    }
    dark = preparedDark.mark
  }

  // The Primary Scheme picks one mark for every raster, since no PNG format
  // selects by color scheme.
  const rasterMark =
    scheme.opaque && scheme.primary === 'dark' ? (dark ?? source.mark) : source.mark
  const { files, icoMembers } = renderRenditions(
    rasterMark,
    scheme.opaque ? null : dark,
    scheme.iconBackground,
    scheme.opaque,
  )

  files.set('favicon.ico', packIco(icoMembers))
  files.set('favicon.svg', encoder.encode(buildFaviconSvg(source.mark, dark)))
  if (dark !== null) {
    // Single-scheme hand-off files; referenced by nothing (ADR 0004).
    files.set('favicon-light.svg', encoder.encode(buildFaviconSvg(source.mark, null)))
    files.set('favicon-dark.svg', encoder.encode(buildFaviconSvg(dark, null)))
  }

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

/**
 * Settings as they will actually render. An active Color Pair owns Icon
 * Background, so the stored value never disagrees with the pixels (ADR 0003).
 */
function resolveSettings(sourceSvg: string, darkSvg: string | null, settings: Settings): Settings {
  const { iconBackground } = resolveScheme(sourceSvg, darkSvg, settings)
  return iconBackground === settings.iconBackground ? settings : { ...settings, iconBackground }
}

/** The Color Pair to offer for this pair of marks, or null when ineligible. */
function colorPairSeed(sourceSvg: string, darkSvg: string | null): ColorPair | null {
  return canRecolor(sourceSvg, darkSvg) ? inferColorPair(sourceSvg) : null
}

function buildBundle(sourceSvg: string, darkSvg: string | null, settings: Settings): BundleResult {
  return withManifest(render(sourceSvg, darkSvg, settings), settings)
}

export type Pipeline = {
  buildBundle(sourceSvg: string, darkSvg: string | null, settings: Settings): BundleResult

  render(sourceSvg: string, darkSvg: string | null, settings: RenderSettings): RenderedMark

  withManifest(rendered: RenderedMark, settings: ManifestSettings): BundleResult

  inferSettings(sourceSvg: string, filename: string): Settings

  colorPairSeed(sourceSvg: string, darkSvg: string | null): ColorPair | null

  resolveSettings(sourceSvg: string, darkSvg: string | null, settings: Settings): Settings

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
    colorPairSeed,
    resolveSettings,
    normalize,
    measureMark,
    rasterize,
    rasterizeToPixels,
    pixelDriftPercent,
  }
}
