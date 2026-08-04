import { existsSync, readFileSync } from 'node:fs'

/** Copy only the Buffer view, not its larger pooled allocation. */
export function readWasmBytes(path: string): ArrayBuffer {
  const buffer = readFileSync(path)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

export function firstExisting(...paths: string[]): string {
  const found = paths.find((path) => existsSync(path))
  if (found === undefined) {
    throw new Error(`resvg WASM not found. Looked in:\n  ${paths.join('\n  ')}`)
  }
  return found
}
