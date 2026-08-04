import { Electroview } from 'electrobun/view'

import type { ManifestoRPC } from '../shared/rpc.ts'

const electroview = new Electroview({
  rpc: Electroview.defineRPC<ManifestoRPC>({
    // Allow time for the user to answer a collision dialog.
    maxRequestTime: 120_000,
    handlers: { requests: {}, messages: {} },
  }),
})

export function bun() {
  const rpc = electroview.rpc
  if (rpc === undefined) {
    throw new Error('RPC is not connected')
  }
  return rpc
}
