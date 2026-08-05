import { beforeAll, describe, expect, test } from 'bun:test'

import { createAssetBundleSessionRpcAdapter } from '../src/bun/asset-bundle-session.ts'
import { createAssetBundleSession } from '../src/host/asset-bundle-session.ts'
import type { Pipeline } from '../src/pipeline/index.ts'
import type { AssetBundleIntent, AssetBundleSessionSnapshot } from '../src/shared/rpc.ts'
import { createAssetBundleSessionClient } from '../src/webview/asset-bundle-session-client.ts'
import { testPipeline } from './helpers.ts'

let pipeline: Pipeline
let receiveSessionSnapshot = (_snapshot: AssetBundleSessionSnapshot): void => {}

beforeAll(async () => {
  pipeline = await testPipeline()
})

const emptySnapshot: AssetBundleSessionSnapshot = {
  desired: null,
  attempt: { kind: 'idle' },
  committed: null,
  matchesDesired: false,
  recoveryNotice: null,
}

describe('Asset Bundle Session RPC adapters', () => {
  test('host adapter forwards intent and publishes handshake state', () => {
    const accepted: AssetBundleIntent[] = []
    let publishes = 0
    const adapter = createAssetBundleSessionRpcAdapter({
      accept(intent) {
        accepted.push(intent)
        return { ok: true }
      },
      publishCurrent() {
        publishes += 1
      },
    })
    const intent = {
      kind: 'open-source',
      sourceSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      filename: 'logo.svg',
    } as const

    expect(adapter.acceptAssetBundleIntent(intent)).toEqual({ ok: true })
    expect(accepted).toEqual([intent])
    expect(adapter.publishAssetBundleSession()).toEqual({ ok: true })
    expect(publishes).toBe(1)
  })

  test('handshake and intent snapshots cross the ordered host-to-webview stream', async () => {
    const session = createAssetBundleSession({
      pipeline,
      render() {
        throw new Error('Rendering is not reached before the scheduled task runs')
      },
      outputRoot: 'C:\\icons',
      scheduler: {
        schedule() {
          return () => {}
        },
      },
      publish(snapshot) {
        receiveSessionSnapshot(snapshot)
      },
    })
    const host = createAssetBundleSessionRpcAdapter(session)
    const client = createAssetBundleSessionClient({
      accept(intent) {
        return Promise.resolve(host.acceptAssetBundleIntent(intent))
      },
      requestCurrent() {
        return Promise.resolve(host.publishAssetBundleSession())
      },
    })
    receiveSessionSnapshot = client.receive
    const rendered: AssetBundleSessionSnapshot[] = []
    const disconnect = client.connect(
      (snapshot) => {
        rendered.push(snapshot)
      },
      () => {},
    )
    await Promise.resolve()
    expect(rendered).toEqual([emptySnapshot])

    const intent = {
      kind: 'open-source',
      sourceSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      filename: 'new-name.svg',
    } as const
    const acceptedResult = await client.submit(intent)
    expect(acceptedResult).toEqual({ ok: true })
    expect(rendered.at(-1)?.desired?.bundleName).toBe('new-name')
    expect(rendered.at(-1)?.attempt.kind).toBe('working')
    disconnect()
    host.publishAssetBundleSession()
    expect(rendered).toHaveLength(2)
  })
})
