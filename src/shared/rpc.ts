/** RPC is JSON, so generated file bytes cross the boundary as base64 strings. */

import type { RPCSchema } from 'electrobun/main'

import type { Advisory, ColorPair, Settings } from '../pipeline/index.ts'
import type { WindowFrame, WindowPlacement } from './window-frame.ts'

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
  /**
   * The Color Pair to offer, or null when this mark cannot be recolored —
   * it is not monochrome, or a Dark Mark is supplied (ADR 0003).
   */
  colorPairSeed: ColorPair | null
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
      /** The frame a resize drag starts from, in points. */
      getWindowPlacement: { params: void; response: WindowPlacement }
    }
    messages: {
      log: { level: 'info' | 'error'; message: string }
      minimizeWindow: void
      toggleMaximizeWindow: void
      closeWindow: void
      /** A message, not a request: a resize drag emits one per frame and never awaits. */
      setWindowFrame: WindowFrame
    }
  }>
  webview: RPCSchema<{
    requests: Record<string, never>
    messages: {
      assetBundleSessionChanged: AssetBundleSessionSnapshot
    }
  }>
}
