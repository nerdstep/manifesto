import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { main } from '../src/cli/index.ts'
import { inspectTarget, recallSettings, SIDECAR_FILENAME } from '../src/host/bundle-writer.ts'
import { BUNDLE_FILENAMES } from '../src/pipeline/index.ts'
import { fixture } from './helpers.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function scenario() {
  const root = mkdtempSync(join(tmpdir(), 'manifesto-cli-'))
  roots.push(root)
  const source = join(root, 'acme-logo.svg')
  const output = join(root, 'public')
  writeFileSync(source, fixture('square-tight'))
  return { source, output }
}

async function expectFailure(action: () => Promise<unknown>, message: string): Promise<void> {
  let error: unknown
  try {
    await action()
  } catch (caught) {
    error = caught
  }
  expect(error).toBeInstanceOf(Error)
  if (error instanceof Error) expect(error.message).toContain(message)
}

describe('CLI Bundle writing', () => {
  test('writes the complete Bundle and Sidecar while preserving unrelated files', async () => {
    const { source, output } = scenario()
    mkdirSync(output)
    writeFileSync(join(output, 'index.html'), '<!doctype html>')

    expect(await main([source, output])).toBe(0)

    for (const filename of BUNDLE_FILENAMES) {
      expect(readFileSync(join(output, filename)).length).toBeGreaterThan(0)
    }
    const sidecar: unknown = JSON.parse(readFileSync(join(output, SIDECAR_FILENAME), 'utf8'))
    expect(sidecar).toMatchObject({
      bundleName: 'public',
      generator: 'manifesto',
    })
    if (typeof sidecar !== 'object' || sidecar === null || !('sourceHash' in sidecar)) {
      throw new Error('CLI Sidecar did not record a source hash')
    }
    expect(inspectTarget(output, String(sidecar.sourceHash)).kind).toBe('same-mark')
    expect(recallSettings(output)?.name).toBe('Acme')
    expect(readFileSync(join(output, 'index.html'), 'utf8')).toBe('<!doctype html>')
  })

  test('refuses authored-file collisions unless --force is explicit', async () => {
    const { source, output } = scenario()
    await main([source, output])
    writeFileSync(join(output, 'favicon.ico'), 'hand-edited')

    await expectFailure(() => main([source, output]), 'pass --force')
    expect(readFileSync(join(output, 'favicon.ico'), 'utf8')).toBe('hand-edited')

    expect(await main([source, output, '--force'])).toBe(0)
    expect(readFileSync(join(output, 'favicon.ico'))).not.toEqual(Buffer.from('hand-edited'))
  })

  test('rejects unknown options and missing option values', async () => {
    const { source, output } = scenario()

    await expectFailure(() => main([source, output, '--wat']), 'Unknown option')
    await expectFailure(() => main([source, output, '--name']), '--name needs a value')
  })
})
