export type Hex = `#${string}`

/** Settings that require rasterization. */
export type RenderSettings = {
  iconBackground: Hex
  optimizeSvg: boolean
}

/** Settings written only to `site.webmanifest`. */
export type ManifestSettings = {
  name: string
  shortName: string
  themeColor: Hex
  splashBackground: Hex
}

export type Settings = RenderSettings & ManifestSettings

export type AdvisoryOrigin = 'source' | 'dark'

export type Advisory = (
  | { kind: 'wordmark'; aspectRatio: number }
  | { kind: 'text-elements'; count: number }
  | { kind: 'external-image'; hrefs: string[] }
  | { kind: 'active-content-removed'; foreignObjects: number; externalStyles: number }
  | { kind: 'svgo-pixel-drift'; percent: number }
  | { kind: 'scripts-removed'; elements: number; attributes: number }
) & { origin?: AdvisoryOrigin }

export type Extent = { x: number; y: number; w: number; h: number }

/** `maxRadius` measures the furthest painted pixel from the extent center. */
export type MarkGeometry = {
  extent: Extent
  maxRadius: number
}

export type Fit = { mode: 'box'; inset: number } | { mode: 'circle'; diameter: number }

export type Treatment = {
  size: number
  background: 'iconBackground' | null
  fit: Fit
}

export type RenditionSpec = {
  filename: string | null
  treatment: Treatment
  /** Web app manifest purpose when the rendition belongs in its icon list. */
  manifestPurpose?: 'any' | 'maskable'
}

/** Rasterized files and metadata before `site.webmanifest` is added. */
export type RenderedMark = {
  files: Map<string, Uint8Array>
  advisories: Advisory[]
  sourceHash: string
  originalBytes: number
  optimizedBytes: number
}

export type BundleResult = RenderedMark

export class EmptyMarkError extends Error {
  override readonly name = 'EmptyMarkError'
  constructor(message = 'This SVG paints nothing that can be rendered.') {
    super(message)
  }
}

export class InvalidSvgError extends Error {
  override readonly name = 'InvalidSvgError'
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length
}
