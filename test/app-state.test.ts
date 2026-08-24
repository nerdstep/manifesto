import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEFAULT_WINDOW_CSS,
  loadState,
  saveState,
  stateFilePath,
  windowFrame,
} from '../src/bun/app-state.ts'
import { parseJsonObject } from './helpers.ts'

let dir: string
let statePath: string
const FALLBACK_ROOT = '/tmp/fallback-root'

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'manifesto-state-'))
  statePath = join(dir, 'state.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('loadState', () => {
  test('falls back cleanly when there is no file', () => {
    expect(loadState(statePath, FALLBACK_ROOT)).toEqual({ outputRoot: FALLBACK_ROOT })
  })

  test('survives a corrupt file', () => {
    writeFileSync(statePath, '{ this is not json')
    expect(loadState(statePath, FALLBACK_ROOT).outputRoot).toBe(FALLBACK_ROOT)
  })

  test('survives a file of the wrong shape', () => {
    writeFileSync(statePath, JSON.stringify({ outputRoot: 42, window: 'big' }))
    expect(loadState(statePath, FALLBACK_ROOT).outputRoot).toBe(FALLBACK_ROOT)
  })

  test('ignores an empty output root rather than writing to nowhere', () => {
    writeFileSync(statePath, JSON.stringify({ outputRoot: '' }))
    expect(loadState(statePath, FALLBACK_ROOT).outputRoot).toBe(FALLBACK_ROOT)
  })

  test('ignores a window frame written by an older version', () => {
    // It only ever held the default it was created with, so there is nothing to migrate.
    writeFileSync(
      statePath,
      JSON.stringify({
        outputRoot: '/somewhere/real',
        window: { x: 1, y: 2, width: 3, height: 4 },
      }),
    )
    expect(loadState(statePath, FALLBACK_ROOT)).toEqual({ outputRoot: '/somewhere/real' })
  })
})

describe('saveState', () => {
  test('round-trips', () => {
    const state = { outputRoot: '/some/where' }
    saveState(statePath, state)

    expect(loadState(statePath, FALLBACK_ROOT)).toEqual(state)
  })

  test('creates the directory it needs', () => {
    const nested = join(dir, 'a', 'b', 'state.json')
    saveState(nested, { outputRoot: '/x' })

    expect(parseJsonObject(readFileSync(nested, 'utf8')).outputRoot).toBe('/x')
  })
})

describe('windowFrame', () => {
  /** A 2560x1440-point display with a 48-point taskbar along the bottom. */
  const WORK_AREA = { x: 0, y: 0, width: 2560, height: 1392 }

  test('passes the intended size through unscaled', () => {
    // Electrobun applies the display scale itself. Multiplying here too opened the
    // window at 2880x1980 physical with a 1920x1320 CSS viewport — the content
    // rendered at two thirds size in a window half again too big.
    const frame = windowFrame(WORK_AREA)

    expect(frame.width).toBe(DEFAULT_WINDOW_CSS.width)
    expect(frame.height).toBe(DEFAULT_WINDOW_CSS.height)
  })

  test('centres in the work area', () => {
    const frame = windowFrame(WORK_AREA)

    expect(frame.x).toBe((2560 - DEFAULT_WINDOW_CSS.width) / 2)
    expect(frame.y).toBe((1392 - DEFAULT_WINDOW_CSS.height) / 2)
  })

  test('never opens larger than the work area', () => {
    // 1080p at 150% is 1280x720 in points, less the taskbar. A window taller than the
    // work area loses its bottom edge behind the taskbar with no way to reach it.
    const frame = windowFrame({ x: 0, y: 0, width: 1280, height: 672 })

    expect(frame.width).toBeLessThanOrEqual(1280)
    expect(frame.height).toBeLessThanOrEqual(672)
    expect(frame.height).toBeLessThan(DEFAULT_WINDOW_CSS.height)
  })

  test('respects a work area that does not start at the origin', () => {
    // A taskbar docked left, or a primary display placed right of another one. Ignoring
    // the offset puts the window over the taskbar or on the wrong monitor.
    const frame = windowFrame({ x: 120, y: 40, width: 2000, height: 1200 })

    expect(frame.x).toBe(120 + (2000 - DEFAULT_WINDOW_CSS.width) / 2)
    expect(frame.y).toBe(40 + (1200 - DEFAULT_WINDOW_CSS.height) / 2)
  })

  test('falls back to something openable when the display cannot be measured', () => {
    // Screen reports zeroes when it has no native binding to ask.
    const frame = windowFrame({ x: 0, y: 0, width: 0, height: 0 })

    expect(frame).toEqual({ x: 120, y: 90, ...DEFAULT_WINDOW_CSS })
  })
})

describe('stateFilePath', () => {
  test('namespaces under the app data directory', () => {
    expect(stateFilePath('/appdata')).toBe(join('/appdata', 'manifesto', 'state.json'))
  })
})
