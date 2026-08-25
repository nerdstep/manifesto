import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { isPlainObject } from 'es-toolkit'

import type { WindowFrame } from '../shared/window-frame.ts'

export type AppState = {
  outputRoot: string
}

export const DEFAULT_WINDOW_CSS = { width: 1280, height: 880 }

const FALLBACK_POSITION = { x: 120, y: 90 }

/** The usable region of a display, as `Screen.getPrimaryDisplay()` reports it. */
export type WorkArea = { x: number; y: number; width: number; height: number }

/**
 * Centre the intended size in the display's work area.
 *
 * Both are in points, which is what `BrowserWindow` expects — Electrobun applies the
 * display scale itself. Scaling the size by the device pixel ratio here instead applies
 * it twice, and a 1280x880 window opens at 2880x1980 physical with its content laid out
 * at 1920x1320 CSS pixels.
 *
 * The work area excludes the taskbar and starts at its own origin, so a taskbar on any
 * edge — or a primary display that is not at (0, 0) — is handled by arithmetic rather
 * than by leaving a margin and hoping.
 */
export function windowFrame(workArea: WorkArea): WindowFrame {
  if (workArea.width <= 0 || workArea.height <= 0) {
    // Screen reports zeroes when it cannot measure the display. A window in a
    // known-good place beats a window sized from nonsense.
    return { ...FALLBACK_POSITION, ...DEFAULT_WINDOW_CSS }
  }

  const width = Math.min(DEFAULT_WINDOW_CSS.width, workArea.width)
  const height = Math.min(DEFAULT_WINDOW_CSS.height, workArea.height)

  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  }
}

/** Treat missing, corrupt, or outdated state as a first launch. */
export function loadState(path: string, defaultOutputRoot: string): AppState {
  const fallback: AppState = { outputRoot: defaultOutputRoot }
  if (!existsSync(path)) {
    return fallback
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isPlainObject(parsed)) {
      return fallback
    }

    const stored: unknown = parsed.outputRoot
    return {
      outputRoot: typeof stored === 'string' && stored.length > 0 ? stored : defaultOutputRoot,
    }
  } catch {
    return fallback
  }
}

export function saveState(path: string, state: AppState): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`)
}

export function stateFilePath(appDataDir: string): string {
  return join(appDataDir, 'manifesto', 'state.json')
}
