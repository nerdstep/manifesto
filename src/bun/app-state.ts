/**
 * The small amount of state that outlives a session.
 *
 * Deliberately not where Bundle settings live — those go in each Bundle's Sidecar, so a
 * Bundle explains itself and this app holds no hidden database that can go stale when a
 * folder moves. What is left is genuinely app-level, and after the window frame stopped
 * being stored that is exactly one thing: where to write.
 *
 * The window geometry lives here too, but as a computation rather than as state — see
 * `windowFrame()`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type WindowFrame = { x: number; y: number; width: number; height: number }

export type AppState = {
  outputRoot: string
}

/**
 * The window we want, in CSS pixels — the units the layout was designed against.
 *
 * Not persisted. A stored frame was only ever the first-run default read straight back:
 * `BrowserWindow` exposes `close`/`created`/`hidden` and no resize or move event, so
 * nothing ever updated it. Keeping it gave the impression the app remembered a window size
 * it had never once observed, and it blocked this default from ever taking effect for
 * anyone who had already launched the app.
 */
export const DEFAULT_WINDOW_CSS = { width: 1080, height: 840 }

/** Never take up more than this much of the display, so the window always fits. */
const MAX_SCREEN_FRACTION = 0.9

/** Used when the display cannot be measured, e.g. off Windows. */
const FALLBACK_POSITION = { x: 120, y: 90 }

/**
 * The frame to open at, in **physical** pixels.
 *
 * Physical because `enablePerMonitorDpi()` has made the process DPI-aware by the time this
 * is used — before that, Windows virtualized these numbers and silently stretched the
 * result. `scale` converts the CSS size above into the physical one that produces it.
 *
 * Pure, so the clamping and centring are testable without a display.
 */
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

  // A 1080p display at 150% has less room than the CSS size implies, so the intended
  // window would open taller than the screen and lose its bottom edge behind the taskbar.
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

/**
 * Narrowing predicates rather than assertions.
 *
 * These read a file that anything could have written, so every field is checked. An
 * assertion here would be claiming knowledge we do not have about someone else's bytes.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Read state, falling back to defaults on anything unexpected.
 *
 * A corrupt state file must never stop the app opening — the worst case is that the Output
 * Root reverts to the default once.
 *
 * A `window` key written by an older version is ignored rather than migrated. It only ever
 * held the default it was created with.
 */
export function loadState(path: string, defaultOutputRoot: string): AppState {
  const fallback: AppState = { outputRoot: defaultOutputRoot }
  if (!existsSync(path)) return fallback

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isObject(parsed)) return fallback

    const stored = parsed.outputRoot
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
