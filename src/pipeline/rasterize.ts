/** Own all resvg calls and free WASM objects after each operation. */

import { initWasm, Resvg } from '@resvg/resvg-wasm'

import { InvalidSvgError } from './types.ts'

/** resvg allows one process-global WASM initialization. */
let ready: Promise<void> | null = null

export function initializeOnce(wasm: ArrayBuffer | Uint8Array): Promise<void> {
  ready ??= initWasm(wasm)
  return ready
}

function assertReady(): void {
  if (ready === null) {
    throw new Error(
      'The rasterizer is not initialised. Obtain these functions from createPipeline() ' +
        'rather than importing them directly.',
    )
  }
}

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

export function documentSize(svg: string): { width: number; height: number } {
  return withDocument(svg, undefined, (doc) => ({ width: doc.width, height: doc.height }))
}

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

/** Limit the longest side so extreme aspect ratios cannot create oversized probes. */
export function rasterizeToPixels(svg: string, longestSide: number): PixelBuffer {
  const { width, height } = documentSize(svg)
  const mode = width >= height ? 'width' : 'height'

  return withDocument(svg, { fitTo: { mode, value: longestSide } }, (doc) => {
    const image = doc.render()
    try {
      // Copy pixels before freeing the WASM image.
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
