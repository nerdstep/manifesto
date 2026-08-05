/** RPC is JSON, so generated file bytes cross the boundary as base64 strings. */

import type { RPCSchema } from 'electrobun/bun'

import type { Advisory, Settings } from '../pipeline/index.ts'

export type BundleWire = {
  /** Maps filenames to base64 bytes. */
  files: Record<string, string>
  advisories: Advisory[]
  sourceHash: string
  originalBytes: number
  optimizedBytes: number
  writtenTo: string | null
  bundleName: string
  settings: Settings
}

export type AssetBundleSessionDesired = {
  sourceSvg: string
  filename: string
  darkSvg: string | null
  darkFilename: string | null
  settings: Settings | null
  bundleName: string
  outputRoot: string
}

export type AssetBundleSessionAttempt =
  | { kind: 'idle' }
  | { kind: 'working'; previousError: string | null }
  | { kind: 'failed'; error: string }

export type AssetBundleSessionSnapshot = {
  desired: AssetBundleSessionDesired | null
  attempt: AssetBundleSessionAttempt
  committed: BundleWire | null
  matchesDesired: boolean
  recoveryNotice: string | null
}

export type AssetBundleIntent =
  | {
      kind: 'open-source'
      sourceSvg: string
      filename: string
    }
  | { kind: 'patch-settings'; change: Partial<Settings> }
  | { kind: 'commit-bundle-name'; bundleName: string }
  | { kind: 'set-dark-mark'; darkSvg: string; darkFilename: string }
  | { kind: 'clear-dark-mark' }
  | { kind: 'change-output-root'; outputRoot: string }
  | { kind: 'retry' }

export type AcceptIntentResult = { ok: true } | { ok: false; error: string }

export type ManifestoRPC = {
  bun: RPCSchema<{
    requests: {
      acceptAssetBundleIntent: { params: AssetBundleIntent; response: AcceptIntentResult }
      publishAssetBundleSession: { params: void; response: { ok: true } }
      /** Returns SVG text so the webview remains filesystem-free. */
      chooseSvg: {
        params: void
        response: { svg: string; filename: string } | null
      }
      getOutputRoot: { params: void; response: { path: string } }
      chooseOutputRoot: { params: void; response: { path: string } }
      revealInFolder: { params: { path: string }; response: { ok: boolean } }
      copyToClipboard: { params: { text: string }; response: { ok: boolean } }
      /** Force WebView2 to repaint its scrollbar after the document height changes. */
      refreshViewport: { params: void; response: { ok: boolean } }
    }
    messages: {
      log: { level: 'info' | 'error'; message: string }
      minimizeWindow: void
      toggleMaximizeWindow: void
      closeWindow: void
    }
  }>
  webview: RPCSchema<{
    requests: Record<string, never>
    messages: {
      assetBundleSessionChanged: AssetBundleSessionSnapshot
    }
  }>
}
