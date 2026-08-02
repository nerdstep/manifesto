/**
 * The disk layer.
 *
 * This is the only code in the app that can destroy someone's work, so the collision
 * guard gets the most attention. Real temp directories throughout — mocking the
 * filesystem here would test the mock.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  inspectTarget,
  nextAvailableName,
  recallSettings,
  SIDECAR_FILENAME,
  slugify,
  writeBundle,
} from '../src/bun/bundle-writer.ts'
import type { Pipeline } from '../src/pipeline/index.ts'
import { defaultSettings, fixture, parseJsonObject, testPipeline } from './helpers.ts'

let pipeline: Pipeline
let root: string

beforeAll(async () => {
  pipeline = await testPipeline()
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'manifesto-test-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function bundleOf(name: Parameters<typeof fixture>[0]) {
  return pipeline.buildBundle(fixture(name), null, defaultSettings)
}

function write(dir: string, name: Parameters<typeof fixture>[0], bundleName = 'acme') {
  const bundle = bundleOf(name)
  writeBundle(dir, bundle, {
    sourceHash: bundle.sourceHash,
    bundleName,
    settings: defaultSettings,
  })
  return bundle
}

describe('slugify', () => {
  test('makes a filesystem-safe name from a filename', () => {
    expect(slugify('Acme Logo.svg')).toBe('acme-logo')
    expect(slugify('acme_logo_final.svg')).toBe('acme-logo-final')
    expect(slugify('ACME.svg')).toBe('acme')
  })

  test('strips characters that have meaning to a filesystem', () => {
    expect(slugify('a/b\\c:d*e?.svg')).toBe('abcde')
    expect(slugify('../../etc/passwd.svg')).toBe('etcpasswd')
  })

  test('never returns an empty name', () => {
    // An empty Bundle Name would write straight into the Output Root.
    expect(slugify('.svg')).toBe('icons')
    expect(slugify('!!!.svg')).toBe('icons')
  })

  test('is independent of the manifest name', () => {
    // Bundle Name is a filesystem slug; `name` is a display string. Conflating them
    // means editing a PWA label renames a directory.
    expect(slugify('Northwind Trading Co.svg')).toBe('northwind-trading-co')
  })
})

describe('writeBundle', () => {
  test('writes every file plus the Sidecar', () => {
    const dir = join(root, 'acme')
    const bundle = write(dir, 'square-tight')

    for (const filename of bundle.files.keys()) {
      expect(existsSync(join(dir, filename)), `missing ${filename}`).toBe(true)
    }
    expect(existsSync(join(dir, SIDECAR_FILENAME))).toBe(true)
  })

  test('the Sidecar records what produced the Bundle', () => {
    const dir = join(root, 'acme')
    const bundle = write(dir, 'square-tight')

    const sidecar = parseJsonObject(readFileSync(join(dir, SIDECAR_FILENAME), 'utf8'))
    expect(sidecar).toMatchObject({
      sourceHash: bundle.sourceHash,
      bundleName: 'acme',
      settings: defaultSettings,
      generator: 'manifesto',
    })
    expect(typeof sidecar.generatedAt).toBe('string')
  })

  test('bytes on disk are the bytes the pipeline produced', () => {
    const dir = join(root, 'acme')
    const bundle = write(dir, 'multicolor')

    for (const [filename, bytes] of bundle.files) {
      const onDisk = readFileSync(join(dir, filename))
      expect(Buffer.compare(onDisk, Buffer.from(bytes)), filename).toBe(0)
    }
  })

  test('leaves files it did not author alone', () => {
    // A Bundle that shrinks must not silently delete the previous one's output, and the
    // app should never remove a file it cannot account for.
    const dir = join(root, 'acme')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'notes.txt'), 'hand-written')

    write(dir, 'square-tight')

    expect(readFileSync(join(dir, 'notes.txt'), 'utf8')).toBe('hand-written')
  })
})

describe('inspectTarget — the collision guard', () => {
  test('a missing directory is safe', () => {
    expect(inspectTarget(join(root, 'nope'), 'abc').kind).toBe('empty')
  })

  test('an empty directory is safe', () => {
    const dir = join(root, 'empty')
    mkdirSync(dir)
    expect(inspectTarget(dir, 'abc').kind).toBe('empty')
  })

  test('the same mark again is safe — that is just regenerating', () => {
    const dir = join(root, 'acme')
    const bundle = write(dir, 'square-tight')

    expect(inspectTarget(dir, bundle.sourceHash).kind).toBe('same-mark')
  })

  test('a DIFFERENT mark under the same name is a collision', () => {
    // Two clients, two logo.svg files. Without this the second silently destroys the
    // first, including its saved settings.
    const dir = join(root, 'logo')
    write(dir, 'square-tight', 'logo')
    const other = bundleOf('multicolor')

    const found = inspectTarget(dir, other.sourceHash)
    expect(found.kind).toBe('different-mark')
  })

  test('a folder we did not create is a collision', () => {
    // It could be anything — someone's public/, a git worktree. Overwriting it because
    // the name matched would be the worst thing this app could do.
    const dir = join(root, 'public')
    mkdirSync(dir)
    writeFileSync(join(dir, 'index.html'), '<!doctype html>')

    expect(inspectTarget(dir, 'abc').kind).toBe('unknown-folder')
  })

  test('a corrupt Sidecar is treated as unknown, not as permission', () => {
    const dir = join(root, 'acme')
    mkdirSync(dir)
    writeFileSync(join(dir, SIDECAR_FILENAME), '{ not json')

    expect(inspectTarget(dir, 'abc').kind).toBe('unknown-folder')
  })

  test('a Sidecar without a hash cannot grant permission', () => {
    // It cannot answer the only question we ask it, so it is no better than none.
    const dir = join(root, 'acme')
    mkdirSync(dir)
    writeFileSync(join(dir, SIDECAR_FILENAME), JSON.stringify({ bundleName: 'acme' }))

    expect(inspectTarget(dir, 'abc').kind).toBe('unknown-folder')
  })
})

describe('nextAvailableName', () => {
  test('returns the name itself when free', () => {
    expect(nextAvailableName(root, 'acme')).toBe('acme')
  })

  test('suffixes from 2 upward', () => {
    mkdirSync(join(root, 'acme'))
    expect(nextAvailableName(root, 'acme')).toBe('acme-2')

    mkdirSync(join(root, 'acme-2'))
    expect(nextAvailableName(root, 'acme')).toBe('acme-3')
  })
})

describe('recallSettings', () => {
  test('restores the choices a previous run made', () => {
    // Drop the same logo six months later and get back the Icon Background you chose,
    // not a fresh guess.
    const dir = join(root, 'acme')
    const chosen = { ...defaultSettings, iconBackground: '#0B1F3A' as const, name: 'Acme Co' }
    const bundle = bundleOf('square-tight')

    writeBundle(dir, bundle, {
      sourceHash: bundle.sourceHash,
      bundleName: 'acme',
      settings: chosen,
    })

    expect(recallSettings(dir)).toEqual(chosen)
  })

  test('returns null when there is nothing to recall', () => {
    expect(recallSettings(join(root, 'nope'))).toBeNull()
  })
})
