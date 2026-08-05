import type {
  AcceptIntentResult,
  AssetBundleIntent,
  AssetBundleSessionSnapshot,
} from '../shared/rpc.ts'

export type AssetBundleSessionClientTransport = {
  accept: (intent: AssetBundleIntent) => Promise<AcceptIntentResult>
  requestCurrent: () => Promise<unknown>
}

/** Adapts the ordered RPC stream to the subscription lifecycle used by the Preact hook. */
export function createAssetBundleSessionClient(transport: AssetBundleSessionClientTransport) {
  const listeners = new Set<(snapshot: AssetBundleSessionSnapshot) => void>()

  function receive(snapshot: AssetBundleSessionSnapshot): void {
    for (const listener of listeners) {
      listener(snapshot)
    }
  }

  function connect(
    listener: (snapshot: AssetBundleSessionSnapshot) => void,
    onHandshakeFailure: (error: unknown) => void,
  ): () => void {
    listeners.add(listener)
    void transport.requestCurrent().catch((error: unknown) => {
      onHandshakeFailure(error)
    })
    return () => {
      listeners.delete(listener)
    }
  }

  function submit(intent: AssetBundleIntent): Promise<AcceptIntentResult> {
    return transport.accept(intent)
  }

  return { connect, receive, submit }
}
