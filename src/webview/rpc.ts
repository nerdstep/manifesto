/**
 * The webview's half of the RPC.
 *
 * `import { Electroview }` — the default export of `electrobun/view` is a namespace
 * object, not the class, and calling `.defineRPC` on it throws. That failure kills the
 * module, which takes the drop handlers with it, which presents as "drag and drop
 * doesn't work". It has cost real time; do not "simplify" this import.
 */

import { Electroview } from 'electrobun/view'

import type { ManifestoRPC } from '../shared/rpc.ts'

const electroview = new Electroview({
  rpc: Electroview.defineRPC<ManifestoRPC>({
    maxRequestTime: 30_000,
    handlers: { requests: {}, messages: {} },
  }),
})

/** The Bun side. Throws rather than returning undefined — a dead channel is not a state. */
export function bun() {
  const rpc = electroview.rpc
  if (rpc === undefined) throw new Error('RPC is not connected')
  return rpc
}
