/**
 * The only place resvg is called.
 *
 * The pipeline must stay free of `fs`, so the caller supplies the WASM bytes:
 * the Bun shell reads them from the bundled asset, tests read them from `node_modules`.
 *
 * Two rules this module exists to enforce:
 *
 * 1. Renditions are rasterized from their own wrapper SVG at final dimensions. Nothing
 *    is ever resampled. Grep this file for a resize call and find none.
 * 2. The alpha-scan probe is the one raster we read rather than emit — it measures, and
 *    never becomes output.
 *
 * WASM objects hold memory outside the JS heap, so every `Resvg` and `RenderedImage`
 * here is freed in a `finally`. The app may rasterize on every accepted keystroke; leaking
 * a 1024² buffer per pass would be felt.
 */

import { initWasm, Resvg } from '@resvg/resvg-wasm'

import { InvalidSvgError } from './types.ts'

/**
 * resvg's WASM module is process-global: `initWasm` throws
 * "Already initialized. The `initWasm()` function can be used only once."
 * on a second call. So there is exactly one rasterizer per process, and pretending
 * otherwise — threading a rasterizer value around as a dependency — would be inventing
 * a seam with only one possible adapter.
 *
 * The state therefore lives here, and `createPipeline()` is the only thing allowed to
 * initialise it. Callers never see this.
 */
let ready: Promise<void> | null = null

/**
 * Initialise resvg exactly once.
 *
 * @internal Only `createPipeline()` calls this. Everything that rasterizes is reachable
 * only through the object `createPipeline()` returns, which is why no public interface
 * carries "call this first" any more.
 */
export function initializeOnce(wasm: ArrayBuffer | Uint8Array): Promise<void> {
  ready ??= initWasm(wasm)
  return ready
}

/**
 * Backstop, not a contract.
 *
 * The public path makes this unreachable — you cannot obtain a rasterizing function
 * without having awaited `createPipeline()`. It stays because these functions are still
 * ESM exports, and a clear message beats resvg's "Wasm has not been initialized".
 */
function assertReady(): void {
  if (ready === null) {
    throw new Error(
      'The rasterizer is not initialised. Obtain these functions from createPipeline() ' +
        'rather than importing them directly.',
    )
  }
}

/** Build a Resvg, hand it to `use`, and free it whatever happens. */
function withDocument<T>(
  svg: string,
  options: ConstructorParameters<typeof Resvg>[1],
  use: (doc: InstanceType<typeof Resvg>) => T,
): T {
  assertReady()

  let doc: InstanceType<typeof Resvg>
  try {
    doc = new Resvg(svg, options)
  } catch (cause) {
    throw new InvalidSvgError(`resvg could not parse this SVG: ${String(cause)}`, { cause })
  }

  try {
    return use(doc)
  } finally {
    doc.free()
  }
}

export type PixelBuffer = { width: number; height: number; pixels: Uint8Array }

/**
 * The document's intrinsic viewport size in px — the coordinate space painted extents
 * are expressed in.
 */
export function documentSize(svg: string): { width: number; height: number } {
  return withDocument(svg, undefined, (doc) => ({ width: doc.width, height: doc.height }))
}

/**
 * Render to PNG bytes at an exact width.
 *
 * Every caller passes a square canonical wrapper, so width is enough to pin both
 * dimensions.
 */
export function rasterize(svg: string, width: number): Uint8Array {
  return withDocument(svg, { fitTo: { mode: 'width', value: width } }, (doc) => {
    const image = doc.render()
    try {
      return image.asPng()
    } finally {
      image.free()
    }
  })
}

/**
 * Render to raw RGBA.
 *
 * `longestSide` rather than width: a 1×1000 mark fitted to width 1024 would be
 * 1,024,000px tall. Constraining the longer dimension caps both.
 */
export function rasterizeToPixels(svg: string, longestSide: number): PixelBuffer {
  const { width, height } = documentSize(svg)
  const mode = width >= height ? 'width' : 'height'

  return withDocument(svg, { fitTo: { mode, value: longestSide } }, (doc) => {
    const image = doc.render()
    try {
      // `pixels` is a view into WASM memory; copy before the image is freed.
      return {
        width: image.width,
        height: image.height,
        pixels: new Uint8Array(image.pixels),
      }
    } finally {
      image.free()
    }
  })
}
