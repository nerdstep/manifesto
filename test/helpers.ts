import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Pipeline } from '../src/pipeline/index.ts'
import { createPipeline } from '../src/pipeline/index.ts'
import type { Settings } from '../src/pipeline/types.ts'

export const FIXTURE_DIR = join(import.meta.dir, 'fixtures')

export const FIXTURES = [
  'square-tight',
  'square-padded',
  'invisible-frame-none',
  'invisible-frame-opacity',
  'invisible-frame-transparent',
  'wordmark',
  'monochrome',
  'multicolor',
  'no-viewbox',
  'light-mark',
  'with-text',
  'with-script',
  'external-image',
  'empty',
] as const

export type FixtureName = (typeof FIXTURES)[number]

/**
 * Fixtures that paint the same mark at the same relative size, and so must produce
 * identical Renditions. This is the Normalization contract in one list.
 */
export const EQUIVALENT_FIXTURES: FixtureName[] = [
  'square-tight',
  'square-padded',
  'invisible-frame-none',
  'invisible-frame-opacity',
  'invisible-frame-transparent',
]

/** Fixtures that paint nothing and must raise `EmptyMarkError`. */
export const EMPTY_FIXTURES: FixtureName[] = ['with-text', 'empty']

export function fixture(name: FixtureName): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.svg`), 'utf8')
}

/** Load an isolated copy of resvg's WASM bytes for the filesystem-free pipeline. */
export function resvgWasm(): ArrayBuffer {
  const buf = readFileSync(
    join(import.meta.dir, '..', 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm'),
  )
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

/** Return the shared, idempotently initialized test pipeline. */
export function testPipeline(): Promise<Pipeline> {
  return createPipeline(resvgWasm())
}

export const defaultSettings: Settings = {
  name: 'Acme',
  shortName: 'Acme',
  themeColor: '#2E5BFF',
  iconBackground: '#FFFFFF',
  splashBackground: '#FFFFFF',
  optimizeSvg: true,
}

/** Parse JSON without leaking `any` into assertions. */
export function parseJsonObject(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('expected a JSON object')
  }
  return Object.fromEntries(Object.entries(parsed))
}

/** Compare RGBA buffers when byte identity is too strict. */
export function pixelDiff(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) {
    throw new Error('pixel buffers differ in size')
  }
  let differing = 0
  let maxDelta = 0
  for (let i = 0; i < a.length; i += 4) {
    let d = 0
    for (let c = 0; c < 4; c += 1) {
      d = Math.max(d, Math.abs((a[i + c] ?? 0) - (b[i + c] ?? 0)))
    }
    if (d > 0) {
      differing += 1
    }
    maxDelta = Math.max(maxDelta, d)
  }
  const total = a.length / 4
  return { differing, total, percent: (differing / total) * 100, maxDelta }
}
