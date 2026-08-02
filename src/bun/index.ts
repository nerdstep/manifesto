/**
 * The Electrobun shell.
 *
 * Owns the window, the RPC surface, and every filesystem touch. The pipeline stays pure;
 * the webview gets no filesystem access at all — it reads a dropped `File` as text and
 * sends a string.
 *
 * Three things learned in Phase 0 that this file depends on:
 *   - `process.cwd()` is `bin/`, not the app root. Resolve assets from `import.meta.dir`.
 *   - RPC is JSON over a WebSocket, so binary crosses as base64 or not at all.
 *   - the webview opens dropped files unless its own drop guards are registered first.
 */

import { join } from 'node:path'

import { BrowserView, BrowserWindow, Utils } from 'electrobun/bun'

import { firstExisting, readWasmBytes } from '../host/wasm.ts'
import { createPipeline } from '../pipeline/index.ts'
import type { Pipeline } from '../pipeline/index.ts'
import type { ManifestoRPC } from '../shared/rpc.ts'
import { loadState, saveState, stateFilePath, windowFrame } from './app-state.ts'
import type { AppState } from './app-state.ts'
import { chooseOutputRoot, chooseSourceSvg, resolveCollision } from './dialogs.ts'
import { createGenerate } from './generate.ts'
import { createRenderCache } from './render-cache.ts'
import { enablePerMonitorDpi } from './windows-dpi.ts'

// --- startup ---------------------------------------------------------------

/*
 * First statement in the app, and it has to stay first.
 *
 * DPI awareness is latched the moment the process touches a window or a device context.
 * Miss the window and every pixel we draw is bitmap-stretched by the display's scale
 * factor for the rest of the session.
 */
const display = enablePerMonitorDpi()
console.log(`[manifesto] display: ${display.width}x${display.height} at ${display.scale}x`)

const STATE_PATH = stateFilePath(Utils.paths.appData)
const state: AppState = loadState(STATE_PATH, join(Utils.paths.downloads, 'manifesto'))

/**
 * Two candidate paths because the WASM lives in two places: beside the app once
 * packaged (`build.copy` puts it at `Resources/app/resvg.wasm`), and in `node_modules`
 * when running from source.
 */
const pipeline: Pipeline = await createPipeline(
  readWasmBytes(
    firstExisting(
      join(import.meta.dir, '..', 'resvg.wasm'),
      join(import.meta.dir, '..', '..', 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm'),
    ),
  ),
)

/**
 * Every render in the app goes through here, so a metadata keystroke reuses the image
 * files it already has instead of spending 60 ms producing identical bytes.
 */
const renderCached = createRenderCache((sourceSvg, darkSvg, settings) =>
  pipeline.render(sourceSvg, darkSvg, settings),
)

// Materialise the state file on first run rather than waiting for a change. It makes
// the Output Root visible and editable on disk, and means persistence is exercised on
// every launch instead of only when someone happens to pick a folder.
saveState(STATE_PATH, state)

console.log('[manifesto] state:', STATE_PATH)
console.log('[manifesto] output root:', state.outputRoot)

// --- helpers ---------------------------------------------------------------

/**
 * The whole drop→disk operation, with the native modal wired in as its collision prompt.
 *
 * `outputRoot` is a getter rather than a value because the user can change it between
 * requests, and a captured string would keep writing to the old one.
 */
const generate = createGenerate({
  pipeline,
  render: renderCached,
  outputRoot: () => state.outputRoot,
  resolveCollision,
})

// --- rpc -------------------------------------------------------------------

const rpc = BrowserView.defineRPC<ManifestoRPC>({
  maxRequestTime: 30_000,
  handlers: {
    requests: {
      generate,

      chooseSourceSvg: () => chooseSourceSvg(state.outputRoot),

      getOutputRoot: () => ({ path: state.outputRoot }),

      chooseOutputRoot: async () => {
        const chosen = await chooseOutputRoot(state.outputRoot)
        // Cancelling keeps what we had rather than clearing it.
        if (chosen !== null) {
          state.outputRoot = chosen
          saveState(STATE_PATH, state)
        }
        return { path: state.outputRoot }
      },

      revealInFolder: ({ path }) => {
        Utils.showItemInFolder(path)
        return { ok: true }
      },

      copyToClipboard: ({ text }) => {
        Utils.clipboardWriteText(text)
        return { ok: true }
      },
    },

    messages: {
      log: ({ level, message }) => {
        console[level === 'error' ? 'error' : 'log'](`[webview] ${message}`)
      },
    },
  },
})

// --- window ----------------------------------------------------------------

/** Physical pixels, centred, clamped to fit. See `windowFrame()` for why. */
const frame = windowFrame(display)

/** Held so the window is not garbage while the app is running. */
export const mainWindow = new BrowserWindow({
  title: 'Manifesto',
  url: 'views://mainview/index.html',
  frame,
  rpc,
})

/*
 * State is written when it changes, not on the way out.
 *
 * `process.on('beforeExit')` looked like the tidy place for this, but it does not fire
 * when Electrobun quits — the native path calls `forceExit`. Anything relying on it is
 * silently never saved.
 *
 * That is also why the window frame is computed rather than remembered: `BrowserWindow`
 * exposes `close`/`created`/`hidden` and no resize or move event, so a stored frame could
 * only ever be the default written straight back. See `windowFrame()`.
 */
