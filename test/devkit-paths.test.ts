/**
 * Hold `tsconfig.json`'s `electrobun/*` mappings to the devkit's own export map.
 *
 * Hutch generates `.hutch/devkit/tsconfig.json` for this, but it maps with `baseUrl`,
 * which TypeScript 7 removed — so the paths are written out by hand instead, and
 * nothing but this test would notice them drifting from the SDK they point at.
 */

import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const DEVKIT = join(ROOT, '.hutch', 'devkit')
const DEVKIT_PREFIX = './.hutch/devkit/'

/** `tsconfig.json` carries comments; `JSON.parse` does not accept them. */
function json(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8').replaceAll(/^\s*\/\/.*$/gmu, ''))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${what} is not an object`)
  }
  return value
}

/** The single mapped target for each specifier, as written in `tsconfig.json`. */
function tsconfigPaths(): Map<string, string> {
  const options = record(
    record(json(join(ROOT, 'tsconfig.json')), 'tsconfig').compilerOptions,
    'compilerOptions',
  )
  const paths = record(options.paths, 'paths')
  const mapped = new Map<string, string>()

  for (const [specifier, targets] of Object.entries(paths)) {
    const first = isArray(targets) ? targets[0] : undefined
    if (typeof first !== 'string') {
      throw new TypeError(`${specifier} has no mapped target`)
    }
    mapped.set(specifier, first)
  }
  return mapped
}

/** The devkit's `exports` map, keyed by subpath (`.`, `./main`, `./view`). */
function devkitExports(): Map<string, string> {
  const exported = record(record(json(join(DEVKIT, 'package.json')), 'devkit').exports, 'exports')
  const map = new Map<string, string>()

  for (const [subpath, target] of Object.entries(exported)) {
    if (typeof target === 'string') {
      map.set(subpath, target)
    }
  }
  return map
}

describe('devkit paths', () => {
  const mapped = tsconfigPaths()

  // `bun test` runs without a prepared devkit in CI; skip rather than fail when absent.
  const prepared = existsSync(join(DEVKIT, 'package.json'))

  test.skipIf(!prepared)('every mapping matches the devkit export map', () => {
    const exported = devkitExports()

    for (const [specifier, target] of mapped) {
      const subpath = specifier === 'electrobun' ? '.' : `.${specifier.slice('electrobun'.length)}`
      const expected = exported.get(subpath)

      expect(expected, `${specifier} is not in the devkit export map`).toBeString()
      expect(target, `${specifier} maps somewhere the devkit does not export`).toBe(
        `${DEVKIT_PREFIX}${expected?.slice('./'.length) ?? ''}`,
      )
    }
  })

  test.skipIf(!prepared)('every mapping resolves to a file that exists', () => {
    for (const [specifier, target] of mapped) {
      expect(existsSync(join(ROOT, target)), `${specifier} points at a missing file`).toBe(true)
    }
  })

  test('the specifiers the source imports are all mapped', () => {
    const imported = new Set<string>()

    for (const file of new Bun.Glob('**/*.{ts,tsx}').scanSync({ cwd: join(ROOT, 'src') })) {
      const source = readFileSync(join(ROOT, 'src', file), 'utf8')
      for (const [, specifier] of source.matchAll(/from '(electrobun[^']*)'/gu)) {
        if (specifier !== undefined) {
          imported.add(specifier)
        }
      }
    }

    expect(imported.size).toBeGreaterThan(0)
    for (const specifier of imported) {
      expect(mapped.has(specifier), `${specifier} is imported but not mapped`).toBe(true)
    }
  })
})
