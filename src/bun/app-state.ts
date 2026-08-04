import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { isPlainObject } from 'es-toolkit'

export type WindowFrame = { x: number; y: number; width: number; height: number }

export type AppState = {
  outputRoot: string
}

export const DEFAULT_WINDOW_CSS = { width: 1280, height: 880 }

const MAX_SCREEN_FRACTION = 0.9

const FALLBACK_POSITION = { x: 120, y: 90 }

/** Convert the desired CSS size to a centered physical-pixel frame. */
export function windowFrame(display: {
  scale: number
  width: number
  height: number
}): WindowFrame {
  const scale = display.scale > 0 ? display.scale : 1

  const wanted = {
    width: Math.round(DEFAULT_WINDOW_CSS.width * scale),
    height: Math.round(DEFAULT_WINDOW_CSS.height * scale),
  }

  // Clamp the scaled window so it fits on high-DPI displays.
  const width =
    display.width > 0
      ? Math.min(wanted.width, Math.round(display.width * MAX_SCREEN_FRACTION))
      : wanted.width
  const height =
    display.height > 0
      ? Math.min(wanted.height, Math.round(display.height * MAX_SCREEN_FRACTION))
      : wanted.height

  return {
    x: display.width > 0 ? Math.round((display.width - width) / 2) : FALLBACK_POSITION.x,
    y: display.height > 0 ? Math.round((display.height - height) / 2) : FALLBACK_POSITION.y,
    width,
    height,
  }
}

/** Treat missing, corrupt, or outdated state as a first launch. */
export function loadState(path: string, defaultOutputRoot: string): AppState {
  const fallback: AppState = { outputRoot: defaultOutputRoot }
  if (!existsSync(path)) return fallback

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isPlainObject(parsed)) return fallback

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
