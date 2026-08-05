import { assetBundleSessionClient, bun } from './rpc.ts'
import { createUseAssetBundleSession } from './use-asset-bundle-session.ts'

export const useAssetBundleSession = createUseAssetBundleSession({
  client: assetBundleSessionClient,
  chooseSvg: () => bun().request.chooseSvg(),
})
