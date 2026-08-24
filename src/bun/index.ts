import { join } from 'node:path'

import { BrowserView, BrowserWindow, Screen, Utils } from 'electrobun/main'

import { firstExisting, readWasmBytes } from '../host/wasm.ts'
import { createPipeline } from '../pipeline/index.ts'
import type { Pipeline } from '../pipeline/index.ts'
import { desktopPlatform, supportsCustomWindowChrome, type ManifestoRPC } from '../shared/index.ts'
import type { WindowPlacement } from '../shared/window-frame.ts'
import { loadState, saveState, stateFilePath, windowFrame } from './app-state.ts'
import type { AppState } from './app-state.ts'
import {
  createAssetBundleSession,
  createAssetBundleSessionRpcAdapter,
} from './asset-bundle-session.ts'
import { chooseOutputRoot, chooseSvg } from './dialogs.ts'
import { createRenderCache } from './render-cache.ts'

// --- startup ---------------------------------------------------------------

// Electrobun sets per-monitor DPI awareness itself, before this file runs, so the work
// area arrives in points and needs no conversion.
const display = Screen.getPrimaryDisplay()
console.log(
  `[manifesto] display: ${display.bounds.width}x${display.bounds.height} points ` +
    `at ${display.scaleFactor}x`,
)

const STATE_PATH = stateFilePath(Utils.paths.appData)
const state: AppState = loadState(STATE_PATH, join(Utils.paths.downloads, 'manifesto'))

// Resolve the packaged WASM first, then the development dependency.
const pipeline: Pipeline = await createPipeline(
  readWasmBytes(
    firstExisting(
      join(import.meta.dir, '..', 'resvg.wasm'),
      join(import.meta.dir, '..', '..', 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm'),
    ),
  ),
)

const renderCached = createRenderCache((sourceSvg, darkSvg, settings) =>
  pipeline.render(sourceSvg, darkSvg, settings),
)

// Create the state file on first launch.
saveState(STATE_PATH, state)

console.log('[manifesto] state:', STATE_PATH)
console.log('[manifesto] output root:', state.outputRoot)

// --- helpers ---------------------------------------------------------------

const session = createAssetBundleSession({
  pipeline,
  render: renderCached,
  outputRoot: () => state.outputRoot,
  publish(snapshot) {
    mainWindow.webview.rpc?.proxy.send.assetBundleSessionChanged(snapshot)
  },
})
const sessionRpc = createAssetBundleSessionRpcAdapter(session)

// --- rpc -------------------------------------------------------------------

const rpc = BrowserView.defineRPC<ManifestoRPC>({
  maxRequestTime: 120_000,
  handlers: {
    requests: {
      acceptAssetBundleIntent: (intent) => sessionRpc.acceptAssetBundleIntent(intent),

      publishAssetBundleSession: () => sessionRpc.publishAssetBundleSession(),

      chooseSvg: () => chooseSvg(state.outputRoot),

      getOutputRoot: () => ({ path: state.outputRoot }),

      chooseOutputRoot: async () => {
        const chosen = await chooseOutputRoot(state.outputRoot)
        if (chosen !== null) {
          state.outputRoot = chosen
          saveState(STATE_PATH, state)
          session.accept({ kind: 'change-output-root', outputRoot: chosen })
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

      refreshViewport: async () => {
        const { width, height } = mainWindow.getSize()

        // WebView2 needs a native resize to repaint its scrollbar.
        mainWindow.setSize(width + 1, height)
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0)
        })
        mainWindow.setSize(width, height)

        return { ok: true }
      },

      // The annotation is load-bearing: `mainWindow` is declared below and takes `rpc` as
      // an option, so a handler whose return type is inferred *from* `mainWindow` closes
      // the circle and TypeScript gives up on all three (TS7022/TS7023).
      getWindowPlacement: (): WindowPlacement => ({
        ...mainWindow.getFrame(),
        maximized: mainWindow.isMaximized(),
      }),
    },

    messages: {
      log: ({ level, message }) => {
        console[level === 'error' ? 'error' : 'log'](`[webview] ${message}`)
      },

      minimizeWindow: () => {
        mainWindow.minimize()
      },

      toggleMaximizeWindow: () => {
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize()
        } else {
          mainWindow.maximize()
        }
      },

      closeWindow: () => {
        mainWindow.close()
      },

      setWindowFrame: ({ x, y, width, height }) => {
        mainWindow.setFrame(x, y, width, height)
      },
    },
  },
})

// --- window ----------------------------------------------------------------

const frame = windowFrame(display.workArea)
const platform = desktopPlatform(process.platform)

export const mainWindow = new BrowserWindow({
  title: 'Manifesto',
  url: 'views://mainview/index.html',
  frame,
  rpc,
  titleBarStyle: supportsCustomWindowChrome(platform) ? 'hidden' : 'default',
})
