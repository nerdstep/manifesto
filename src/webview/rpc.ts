import { Electroview } from 'electrobun/view'

import type { AssetBundleSessionSnapshot } from '../shared/rpc.ts'
import type { ManifestoRPC } from '../shared/rpc.ts'
import { createAssetBundleSessionClient } from './asset-bundle-session-client.ts'

let receiveSessionSnapshot = (_snapshot: AssetBundleSessionSnapshot): void => {}

const electroview = new Electroview({
  rpc: Electroview.defineRPC<ManifestoRPC>({
    maxRequestTime: 120_000,
    handlers: {
      requests: {},
      messages: {
        assetBundleSessionChanged: (snapshot) => {
          receiveSessionSnapshot(snapshot)
        },
      },
    },
  }),
})

export function bun() {
  const rpc = electroview.rpc
  if (rpc === undefined) {
    throw new Error('RPC is not connected')
  }
  return rpc
}

export const assetBundleSessionClient = createAssetBundleSessionClient({
  accept: (intent) => bun().request.acceptAssetBundleIntent(intent),
  requestCurrent: () => bun().request.publishAssetBundleSession(),
})

receiveSessionSnapshot = assetBundleSessionClient.receive
