/**
 * `ico-endec` ships no types.
 *
 * It passes image buffers through unmodified, so feeding it PNGs yields a
 * PNG-embedded ICO — the Vista+ form every current browser reads. Verified in Phase 0.
 *
 * It uses the `Buffer` global (alloc/concat/from) but imports nothing, so it is safe
 * for the pipeline: no filesystem, no host dependency.
 */
declare module 'ico-endec' {
  export type IconEntry = {
    width: number
    height: number
    colors: number
    colorPlanes: number
    bitsPerPixel: number
    imageSize: number
    imageOffset: number
    imageType: 'png' | 'bmp'
    imageData: Buffer
  }

  /** Pack BMP or PNG buffers into a single ICO container. */
  export function encode(images: Buffer | ArrayBuffer | (Buffer | ArrayBuffer)[]): Buffer

  export function decode(ico: Buffer | ArrayBuffer): IconEntry[]

  const icoEndec: { encode: typeof encode; decode: typeof decode }
  export default icoEndec
}
