/**
 * The drop→disk operation, and the two policies inside it that could lose someone's work.
 *
 * The collision prompt is injected, so these run against a stub that records what it was
 * asked and answers however the test wants. Before `createGenerate` existed, this policy
 * could only be exercised by clicking a native modal — which is to say, not at all.
 */

import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SIDECAR_FILENAME } from '../src/bun/bundle-writer.ts'
import { createGenerate } from '../src/bun/generate.ts'
import type { ResolveCollision } from '../src/bun/generate.ts'
import { createRenderCache } from '../src/bun/render-cache.ts'
import type { Pipeline, Settings } from '../src/pipeline/index.ts'
import type { GenerateRequest } from '../src/shared/rpc.ts'
import { defaultSettings, fixture, parseJsonObject, testPipeline } from './helpers.ts'

let pipeline: Pipeline
const roots: string[] = []

beforeAll(async () => {
  pipeline = await testPipeline()
})

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'manifesto-generate-'))
  roots.push(root)
  return root
}

/** A collision prompt that records every call and answers with `answer`. */
function stubPrompt(answer: string | null) {
  const calls: { root: string; bundleName: string; detail: string }[] = []
  const resolve: ResolveCollision = (root, bundleName, detail) => {
    calls.push({ root, bundleName, detail })
    return Promise.resolve(answer)
  }
  return { resolve, calls }
}

function harness(root: string, answer: string | null = null) {
  const prompt = stubPrompt(answer)
  const generate = createGenerate({
    pipeline,
    render: createRenderCache((svg, dark, settings) => pipeline.render(svg, dark, settings)),
    outputRoot: () => root,
    resolveCollision: prompt.resolve,
  })
  return { generate, prompt }
}

function request(overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    sourceSvg: fixture('square-tight'),
    filename: 'acme-logo.svg',
    darkSvg: null,
    settings: null,
    bundleName: null,
    trigger: 'drop',
    ...overrides,
  }
}

/** Put a Bundle from a *different* mark where this one wants to go. */
function occupyWithOtherMark(root: string, name: string): void {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, SIDECAR_FILENAME),
    JSON.stringify({
      sourceHash: 'a-completely-different-mark',
      bundleName: name,
      generatedAt: '2026-01-02T03:04:05.000Z',
      settings: defaultSettings,
    }),
  )
}

describe('generate', () => {
  test('rejects an unsafe Bundle Name before touching the filesystem', async () => {
    const root = tempRoot()
    const { generate } = harness(root)

    for (const bundleName of ['../outside', '..\\outside', 'C:\\outside', 'CON']) {
      const result = await generate(request({ bundleName, trigger: 'rename' }))
      expect(result.ok, bundleName).toBe(false)
    }

    expect(readdirSync(root)).toEqual([])
  })

  test('a drop infers its settings and returns the ones it used', async () => {
    const root = tempRoot()
    const { generate } = harness(root)

    const result = await generate(request())
    if (!result.ok) throw new Error(result.error)

    // The panel has no other way to learn these — inference reads pixels, which only the
    // Bun side can do.
    expect(result.bundle.settings.name).toBe('Acme')
    expect(result.bundle.bundleName).toBe('acme-logo')
    expect(result.bundle.writtenTo).toBe(join(root, 'acme-logo'))
    expect(existsSync(join(root, 'acme-logo', 'site.webmanifest'))).toBe(true)
  })

  test('a Sidecar for the same mark beats inference', async () => {
    const root = tempRoot()
    const { generate } = harness(root)

    // First drop writes a Sidecar. Then edit the name and write again.
    const first = await generate(request())
    if (!first.ok) throw new Error(first.error)

    const chosen: Settings = { ...first.bundle.settings, name: 'What The User Actually Called It' }
    await generate(request({ settings: chosen, bundleName: 'acme-logo', trigger: 'edit' }))

    // A fresh drop of the same file must restore the choice, not re-guess "Acme".
    const redrop = await generate(request())
    if (!redrop.ok) throw new Error(redrop.error)
    expect(redrop.bundle.settings.name).toBe('What The User Actually Called It')
  })

  describe('the collision policy', () => {
    test('a drop onto another mark asks, and honours "keep both"', async () => {
      const root = tempRoot()
      occupyWithOtherMark(root, 'acme-logo')
      const { generate, prompt } = harness(root, 'acme-logo-2')

      const result = await generate(request())
      if (!result.ok) throw new Error(result.error)

      expect(prompt.calls).toHaveLength(1)
      expect(prompt.calls[0]?.detail).toContain('2026-01-02')
      expect(result.bundle.bundleName).toBe('acme-logo-2')
      expect(result.bundle.writtenTo).toBe(join(root, 'acme-logo-2'))

      // The original is untouched. This is the one thing in the app that could destroy
      // someone's work.
      const sidecar = parseJsonObject(
        readFileSync(join(root, 'acme-logo', SIDECAR_FILENAME), 'utf8'),
      )
      expect(sidecar.sourceHash).toBe('a-completely-different-mark')
    })

    test('cancelling writes nothing but still returns the Bundle', async () => {
      const root = tempRoot()
      occupyWithOtherMark(root, 'acme-logo')
      const { generate } = harness(root, null)

      const result = await generate(request())
      if (!result.ok) throw new Error(result.error)

      expect(result.bundle.writtenTo).toBeNull()
      // The panel keeps working on a Bundle that is not on disk — that is what makes a
      // cancelled drop recoverable rather than a dead end.
      expect(Object.keys(result.bundle.files).length).toBeGreaterThan(0)
      expect(existsSync(join(root, 'acme-logo', 'site.webmanifest'))).toBe(false)
    })

    test('an edit NEVER prompts — it declines to write instead', async () => {
      // The load-bearing one. An edit arrives every 150 ms while a colour picker is
      // dragged; a modal on each would make the app unusable, and auto-replacing someone
      // else's folder would be worse.
      const root = tempRoot()
      occupyWithOtherMark(root, 'acme-logo')
      const { generate, prompt } = harness(root, 'acme-logo-2')

      const result = await generate(
        request({ settings: defaultSettings, bundleName: 'acme-logo', trigger: 'edit' }),
      )
      if (!result.ok) throw new Error(result.error)

      expect(prompt.calls).toHaveLength(0)
      expect(result.bundle.writtenTo).toBeNull()
    })

    test('a rename prompts, because the user just chose that destination', async () => {
      const root = tempRoot()
      occupyWithOtherMark(root, 'somewhere-else')
      const { generate, prompt } = harness(root, 'somewhere-else-2')

      await generate(
        request({ settings: defaultSettings, bundleName: 'somewhere-else', trigger: 'rename' }),
      )

      expect(prompt.calls).toHaveLength(1)
    })

    test('an unknown folder is a collision even though it has no Sidecar', async () => {
      // Someone's `public/` is not ours to overwrite because the name happened to match.
      const root = tempRoot()
      mkdirSync(join(root, 'acme-logo'), { recursive: true })
      writeFileSync(join(root, 'acme-logo', 'index.html'), '<!doctype html>')
      const { generate, prompt } = harness(root, null)

      await generate(request())

      expect(prompt.calls).toHaveLength(1)
      expect(prompt.calls[0]?.detail).toContain("didn't create it")
      expect(readFileSync(join(root, 'acme-logo', 'index.html'), 'utf8')).toBe('<!doctype html>')
    })

    test('editing after a successful drop writes without asking', async () => {
      // The whole policy only works because a successful write leaves a Sidecar with our
      // hash, so every subsequent edit sees `same-mark` and flows.
      const root = tempRoot()
      const { generate, prompt } = harness(root)

      const first = await generate(request())
      if (!first.ok) throw new Error(first.error)

      const edited = await generate(
        request({
          settings: { ...first.bundle.settings, name: 'Renamed' },
          bundleName: first.bundle.bundleName,
          trigger: 'edit',
        }),
      )
      if (!edited.ok) throw new Error(edited.error)

      expect(prompt.calls).toHaveLength(0)
      expect(edited.bundle.writtenTo).toBe(join(root, 'acme-logo'))
      expect(readFileSync(join(root, 'acme-logo', 'site.webmanifest'), 'utf8')).toContain('Renamed')
    })
  })

  test('a mark that paints nothing fails as a result, not an exception', async () => {
    const root = tempRoot()
    const { generate } = harness(root)

    const result = await generate(request({ sourceSvg: fixture('with-text') }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('convert the text to outlines')
  })
})
