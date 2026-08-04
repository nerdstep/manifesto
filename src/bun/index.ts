import { join } from 'node:path'

import { BrowserView, BrowserWindow, Utils } from 'electrobun/bun'

import { firstExisting, readWasmBytes } from '../host/wasm.ts'
import { createPipeline } from '../pipeline/index.ts'
import type { Pipeline } from '../pipeline/index.ts'
import type { ManifestoRPC } from '../shared/rpc.ts'
import { loadState, saveState, stateFilePath, windowFrame } from './app-state.ts'
import type { AppState } from './app-state.ts'
import { chooseOutputRoot, chooseSvg, resolveCollision } from './dialogs.ts'
import { createGenerate } from './generate.ts'
import { createRenderCache } from './render-cache.ts'
import { enablePerMonitorDpi } from './windows-dpi.ts'

// --- startup ---------------------------------------------------------------

// DPI awareness must be set before any window or device context exists.
const display = enablePerMonitorDpi()
console.log(`[manifesto] display: ${display.width}x${display.height} at ${display.scale}x`)

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

const generate = createGenerate({
  pipeline,
  render: renderCached,
  outputRoot: () => state.outputRoot,
  resolveCollision,
})

// --- rpc -------------------------------------------------------------------

const rpc = BrowserView.defineRPC<ManifestoRPC>({
  maxRequestTime: 120_000,
  handlers: {
    requests: {
      generate,

      chooseSvg: () => chooseSvg(state.outputRoot),

      getOutputRoot: () => ({ path: state.outputRoot }),

      chooseOutputRoot: async () => {
        const chosen = await chooseOutputRoot(state.outputRoot)
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
    },

    messages: {
      log: ({ level, message }) => {
        console[level === 'error' ? 'error' : 'log'](`[webview] ${message}`)
      },
    },
  },
})

// --- window ----------------------------------------------------------------

const frame = windowFrame(display)

export const mainWindow = new BrowserWindow({
  title: 'Manifesto',
  url: 'views://mainview/index.html',
  frame,
  rpc,
})
