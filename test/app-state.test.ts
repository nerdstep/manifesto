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
  test('scales the intended CSS size to physical pixels', () => {
    // Use a large display so the clamp does not hide the DPI scaling result.
    const frame = windowFrame({ scale: 1.5, width: 3840, height: 2160 })

    expect(frame.width).toBe(DEFAULT_WINDOW_CSS.width * 1.5)
    expect(frame.height).toBe(DEFAULT_WINDOW_CSS.height * 1.5)
  })

  test('never opens larger than the display', () => {
    // 1080p at 150% has less room than the intended CSS size implies, and a window taller
    // than the screen loses its bottom edge behind the taskbar with no way to reach it.
    const frame = windowFrame({ scale: 1.5, width: 1920, height: 1080 })

    expect(frame.width).toBeLessThanOrEqual(1920)
    expect(frame.height).toBeLessThanOrEqual(1080)
    expect(frame.height).toBeLessThan(DEFAULT_WINDOW_CSS.height * 1.5)
  })

  test('centres on the display', () => {
    const frame = windowFrame({ scale: 1, width: 2000, height: 1000 })

    expect(frame.x).toBe((2000 - frame.width) / 2)
    expect(frame.y).toBe((1000 - frame.height) / 2)
  })

  test('falls back to something openable when the display cannot be measured', () => {
    // Off Windows, or if the FFI call fails. A window in a known-good place beats none.
    const frame = windowFrame({ scale: 1, width: 0, height: 0 })

    expect(frame).toEqual({ x: 120, y: 90, ...DEFAULT_WINDOW_CSS })
  })
})

describe('stateFilePath', () => {
  test('namespaces under the app data directory', () => {
    expect(stateFilePath('/appdata')).toBe(join('/appdata', 'manifesto', 'state.json'))
  })
})
