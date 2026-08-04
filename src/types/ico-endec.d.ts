/** Local declarations for the untyped `ico-endec` package. */
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

  export function encode(images: Buffer | ArrayBuffer | (Buffer | ArrayBuffer)[]): Buffer

  export function decode(ico: Buffer | ArrayBuffer): IconEntry[]

  const icoEndec: { encode: typeof encode; decode: typeof decode }
  export default icoEndec
}
