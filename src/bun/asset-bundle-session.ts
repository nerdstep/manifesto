import { createAssetBundleSession } from '../host/asset-bundle-session.ts'

export { createAssetBundleSession }

type AssetBundleSession = Pick<
  ReturnType<typeof createAssetBundleSession>,
  'accept' | 'publishCurrent'
>

/** Keep transport concerns out of the host-owned session state machine. */
export function createAssetBundleSessionRpcAdapter(session: AssetBundleSession) {
  return {
    acceptAssetBundleIntent: (intent: Parameters<AssetBundleSession['accept']>[0]) =>
      session.accept(intent),
    publishAssetBundleSession() {
      session.publishCurrent()
      return { ok: true as const }
    },
  }
}
