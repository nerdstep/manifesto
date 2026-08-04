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

/**
 * Drops, renames, and root changes may open a collision dialog. Routine edits never do.
 */
export type GenerateTrigger = 'drop' | 'rename' | 'edit' | 'root-change'

export type GenerateRequest = {
  sessionId?: string
  revision?: number
  sourceSvg: string
  filename: string
  darkSvg: string | null
  settings: Settings | null
  bundleName: string | null
  trigger: GenerateTrigger
}

export type GenerateResult = { ok: true; bundle: BundleWire } | { ok: false; error: string }

export type ManifestoRPC = {
  bun: RPCSchema<{
    requests: {
      generate: { params: GenerateRequest; response: GenerateResult }
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
    }
  }>
  webview: RPCSchema<{
    requests: Record<string, never>
    messages: Record<string, never>
  }>
}
