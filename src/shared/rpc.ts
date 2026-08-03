/**
 * The typed RPC surface between the Bun shell and the webview.
 *
 * Electrobun's RPC is JSON over a local WebSocket, AES-GCM encrypted per webview — so
 * binary genuinely cannot cross. `Map<string, Uint8Array>` becomes
 * `Record<string, string>` of base64 here, and only here. The pipeline keeps the honest
 * type because that is what disk writes and tests want.
 *
 * The webview has no filesystem access. It reads a dropped `File` as text (SVG is text)
 * and sends the string; everything coming back is base64 or plain data.
 */

import type { RPCSchema } from 'electrobun/bun'

import type { Advisory, Settings } from '../pipeline/index.ts'

/** A generated Asset Bundle, in a shape that survives JSON. */
export type BundleWire = {
  /** filename → base64 bytes. */
  files: Record<string, string>
  advisories: Advisory[]
  sourceHash: string
  originalBytes: number
  optimizedBytes: number
  /** Where it was written, or `null` if nothing was written. See `trigger`. */
  writtenTo: string | null
  /** The folder name used, which may differ from the one requested after a collision. */
  bundleName: string
  /**
   * The settings this Bundle was actually built with.
   *
   * On a drop the webview sends `null` and gets the inferred — or Sidecar-recalled —
   * settings back here. Inference reads pixels, so it can only run on the Bun side; this
   * field is how the panel finds out what it is editing.
   */
  settings: Settings
}

/**
 * What caused this request, which decides whether it may open a modal.
 *
 * - `drop` / `rename` / `root-change` — the user just chose this destination, so a collision with
 *   something we did not write is worth asking about.
 * - `edit` — a routine settings change. **Never prompts.** It writes only where a
 *   previous write of this same mark already lives, and otherwise reports
 *   `writtenTo: null`. Without this distinction, holding down the Icon Background picker
 *   would open a modal for every colour-pick event.
 */
export type GenerateTrigger = 'drop' | 'rename' | 'edit' | 'root-change'

export type GenerateRequest = {
  /** Identifies one webview lifetime, so revisions can restart after a reload. */
  sessionId?: string
  /** Monotonic webview revision. The host uses it to discard stale queued work. */
  revision?: number
  sourceSvg: string
  /** Filename of the dropped file, for seeding the Bundle Name and the inferred Name. */
  filename: string
  darkSvg: string | null
  /** `null` on a drop: infer them, or recall them from a Sidecar for the same mark. */
  settings: Settings | null
  /** `null` on a drop: derive it from the filename. Never derived from `settings.name`. */
  bundleName: string | null
  trigger: GenerateTrigger
}

/**
 * Generation can fail for a reason the user can act on — a mark made only of `<text>`
 * paints nothing — so failure is a result, not an exception to be stringified at the
 * boundary.
 */
export type GenerateResult = { ok: true; bundle: BundleWire } | { ok: false; error: string }

export type ManifestoRPC = {
  bun: RPCSchema<{
    requests: {
      /** Drop → Asset Bundle on disk. The whole app in one call. */
      generate: { params: GenerateRequest; response: GenerateResult }
      /**
       * Native SVG picker, for the Source Mark or the Dark Mark. `null` when the user cancels.
       *
       * The keyboard route into the app. Dropping a file is the only other way in, and a
       * drop cannot be performed without a pointer — so without this the entire app is
       * unreachable by keyboard, no matter how good the rest of the labelling is.
       *
       * Returns the SVG text rather than a path, so the webview stays filesystem-free and
       * this lands in exactly the same shape a drop produces.
       */
      chooseSvg: {
        params: void
        response: { svg: string; filename: string } | null
      }
      /** Current Output Root, plus whether it was remembered from a previous run. */
      getOutputRoot: { params: void; response: { path: string } }
      /** Native folder picker. Returns the unchanged root if cancelled. */
      chooseOutputRoot: { params: void; response: { path: string } }
      revealInFolder: { params: { path: string }; response: { ok: boolean } }
      copyToClipboard: { params: { text: string }; response: { ok: boolean } }
      /**
       * Re-apply the native WebView bounds after a drop changes the document height.
       *
       * WebView2 can update the root scroll range without repainting its scrollbar. A
       * native bounds change is the only invalidation that refreshes that compositor
       * layer; DOM resize events and rebuilding the CSS scroll container do not.
       */
      refreshViewport: { params: void; response: { ok: boolean } }
    }
    messages: {
      /** Webview failures, surfaced where the developer will see them. */
      log: { level: 'info' | 'error'; message: string }
    }
  }>
  webview: RPCSchema<{
    requests: Record<string, never>
    messages: Record<string, never>
  }>
}
