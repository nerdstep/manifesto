/**
 * Types for the Asset Bundle pipeline.
 *
 * Vocabulary here is the project's domain language — see CONTEXT.md. Source Mark,
 * Dark Mark, Rendition, Treatment, Icon Background, Safe Zone and Normalization all
 * mean something specific; use them as written.
 */

/** A colour as `#rrggbb`. */
export type Hex = `#${string}`

/**
 * The settings that change pixels.
 *
 * Changing any of these — or the Dark Mark, which is a separate argument — means the
 * Renditions must be rasterized again. Everything else is metadata.
 *
 * This partition exists as a type because the panel must skip rasterization when only
 * metadata moved. Left in prose, that knowledge would have to be re-derived in the
 * webview, outside the reach of the purity guard and of every fixture.
 */
export type RenderSettings = {
  /** Opaque fill behind the mark where transparency is illegal. */
  iconBackground: Hex
  /** Feeds SVGO, so it can move pixels — which is why it belongs on this side. */
  optimizeSvg: boolean
}

/**
 * The settings that only ever appear in `site.webmanifest`.
 *
 * None of these touch a Rendition, so changing one is a JSON rewrite and nothing more.
 */
export type ManifestSettings = {
  name: string
  shortName: string
  /** Tints Android Chrome's address bar. Never appears in a Rendition. */
  themeColor: Hex
  /** Manifest `background_color` — the PWA boot splash. Never appears in a Rendition. */
  splashBackground: Hex
}

/**
 * Everything the user can change that the Source Mark cannot answer for itself.
 *
 * An intersection rather than a nesting, so the one-shot callers — the CLI, the tests —
 * still pass one flat object. The partition is operational in `render()` /
 * `withManifest()`, which take the halves separately.
 */
export type Settings = RenderSettings & ManifestSettings

/** Which mark an advisory describes when a Bundle carries two marks. */
export type AdvisoryOrigin = 'source' | 'dark'

/**
 * Something the user should know that does not stop generation.
 *
 * Advisories never block. The single hard failure in this pipeline is a mark with no
 * painted pixels, which throws `EmptyMarkError` — because there is no icon to make.
 */
export type Advisory = (
  | { kind: 'wordmark'; aspectRatio: number }
  | { kind: 'text-elements'; count: number }
  | { kind: 'external-image'; hrefs: string[] }
  | { kind: 'active-content-removed'; foreignObjects: number; externalStyles: number }
  | { kind: 'svgo-pixel-drift'; percent: number }
  /**
   * Reported because the app edited the user's file. Stripping scripts is not
   * optional, but doing it silently would be.
   */
  | { kind: 'scripts-removed'; elements: number; attributes: number }
) & { origin?: AdvisoryOrigin }

/** Painted extents, in the source document's viewport pixels. */
export type Extent = { x: number; y: number; w: number; h: number }

/**
 * What the alpha scan measured about a mark.
 *
 * `maxRadius` is the distance from the centre of `extent` to the furthest painted
 * pixel, in the same units. It exists because the maskable Safe Zone is a CIRCLE:
 * fitting a mark's bounding box into a square tells you nothing about whether its
 * corners escape that circle, and for a mark that paints into its own corners they do.
 */
export type MarkGeometry = {
  extent: Extent
  maxRadius: number
}

/**
 * How a Normalized mark is fitted to the canvas.
 *
 * - `box` — scale the bounding box to fill the canvas minus `inset` on each side.
 *   Right for square and rounded-rect masks, which is everything except maskable.
 * - `circle` — scale so the furthest painted pixel lands on a circle of `diameter`
 *   (as a fraction of the canvas). Shape-aware: a round mark keeps full size, a mark
 *   that paints into its corners shrinks exactly as much as it must and no more.
 */
export type Fit = { mode: 'box'; inset: number } | { mode: 'circle'; diameter: number }

/** The Treatment for one Rendition: how the Normalized mark is placed on the canvas. */
export type Treatment = {
  size: number
  /** `null` means transparent — legal only where the platform allows it. */
  background: 'iconBackground' | null
  fit: Fit
}

/** A file the pipeline emits, and how to build it. */
export type RenditionSpec = {
  /** Output filename, or `null` for the intermediate ICO members. */
  filename: string | null
  treatment: Treatment
  /**
   * `purpose` for this file's entry in the Web App Manifest, or `undefined` if it does
   * not belong there (`apple-touch-icon` is referenced from `<head>`, not the manifest).
   *
   * Kept beside the Treatment so the manifest is generated from the Rendition table
   * rather than a second hand-maintained list that can drift out of step.
   */
  manifestPurpose?: 'any' | 'maskable'
}

/**
 * The expensive half of an Asset Bundle: every file that required rasterizing.
 *
 * Holds the whole Bundle except `site.webmanifest`. Keep one of these across panel
 * edits and metadata changes cost a JSON rewrite instead of six renders.
 */
export type RenderedMark = {
  /** filename → bytes. Converted to base64 only at the RPC boundary. */
  files: Map<string, Uint8Array>
  advisories: Advisory[]
  /** Content hash of the Source Mark, for the Sidecar's collision guard. */
  sourceHash: string
  originalBytes: number
  optimizedBytes: number
}

/**
 * A complete Asset Bundle.
 *
 * Structurally identical to `RenderedMark` — the difference is that `files` also
 * contains `site.webmanifest`. The names record which side of the seam a value came
 * from; `withManifest()` is the only thing that crosses it.
 */
export type BundleResult = RenderedMark

/**
 * The mark paints nothing resvg can see.
 *
 * Covers three cases that all reduce to the same thing: an empty document, a mark made
 * only of `<text>` (resvg renders text blank without font buffers), and a mark made
 * only of invisible geometry. There is no icon to produce, so this is a hard failure
 * rather than an advisory.
 */
export class EmptyMarkError extends Error {
  override readonly name = 'EmptyMarkError'
  constructor(message = 'This SVG paints nothing that can be rendered.') {
    super(message)
  }
}

/** The SVG could not be parsed. */
export class InvalidSvgError extends Error {
  override readonly name = 'InvalidSvgError'
}

/** Byte length of a string as UTF-8, without depending on Node's `Buffer`. */
export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length
}
