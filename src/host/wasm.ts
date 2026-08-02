/**
 * Locating and reading resvg's WASM.
 *
 * One module rather than one copy per host. The subtle part — slicing to the file's own
 * bytes — is the part that gets copy-pasted without its reason, and there are three
 * hosts that need it: the CLI, the tests, and the Electrobun shell.
 *
 * Each host supplies its own path; only the byte handling is shared.
 */

import { existsSync, readFileSync } from 'node:fs'

/**
 * Read a file as a standalone `ArrayBuffer`.
 *
 * `readFileSync` can return a `Buffer` that is a view into a larger pooled allocation,
 * so `.buffer` alone would hand over the whole pool — megabytes of unrelated memory, and
 * a WASM module that fails to instantiate. The slice is load-bearing.
 */
export function readWasmBytes(path: string): ArrayBuffer {
  const buffer = readFileSync(path)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

/**
 * First path that exists.
 *
 * The shell needs this because the WASM lives in two places: beside the bundled app once
 * packaged, and in `node_modules` when running from source. Everything else passes a
 * single known path.
 *
 * @throws when none exist — a missing rasterizer should fail at startup with the list of
 * places looked, not later with "Wasm has not been initialized".
 */
export function firstExisting(...paths: string[]): string {
  const found = paths.find((path) => existsSync(path))
  if (found === undefined) {
    throw new Error(`resvg WASM not found. Looked in:\n  ${paths.join('\n  ')}`)
  }
  return found
}
