import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createRenderCache } from '../src/bun/render-cache.ts'
import { createAssetBundleSession } from '../src/host/asset-bundle-session.ts'
import { SIDECAR_FILENAME } from '../src/host/bundle-writer.ts'
import { hashSource } from '../src/pipeline/index.ts'
import type { Pipeline, RenderedMark } from '../src/pipeline/index.ts'
import type { AssetBundleSessionSnapshot } from '../src/shared/rpc.ts'
import { defaultSettings, fixture, testPipeline } from './helpers.ts'

let pipeline: Pipeline
const roots: string[] = []

beforeAll(async () => {
  pipeline = await testPipeline()
})

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'manifesto-session-'))
  roots.push(root)
  return root
}

function uninitializedDeferred(_value: unknown): never {
  throw new Error('deferred promise was not initialized')
}

function deferredSnapshot() {
  let resolve: (snapshot: AssetBundleSessionSnapshot) => void = uninitializedDeferred
  const promise = new Promise<AssetBundleSessionSnapshot>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function deferred<T>() {
  let resolve: (value: T) => void = uninitializedDeferred
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function fakeScheduler() {
  let jobs: Array<() => void> = []
  return {
    schedule(task: () => void) {
      jobs.push(task)
      return () => {
        jobs = jobs.filter((job) => job !== task)
      }
    },
    async flush() {
      const pending = jobs
      jobs = []
      for (const job of pending) {
        job()
      }
      await Promise.resolve()
    },
  }
}

describe('Asset Bundle Session', () => {
  test('opening a Source Mark publishes working state and then a committed Asset Bundle', async () => {
    const root = tempRoot()
    const snapshots: AssetBundleSessionSnapshot[] = []
    const committed = deferredSnapshot()
    const session = createAssetBundleSession({
      pipeline,
      render: createRenderCache((sourceSvg, darkSvg, settings) =>
        pipeline.render(sourceSvg, darkSvg, settings),
      ),
      outputRoot: root,
      publish(snapshot) {
        snapshots.push(snapshot)
        if (snapshot.attempt.kind === 'idle' && snapshot.committed !== null) {
          committed.resolve(snapshot)
        }
      },
    })

    expect(
      session.accept({
        kind: 'open-source',
        sourceSvg: fixture('square-tight'),
        filename: 'acme-logo.svg',
      }),
    ).toEqual({ ok: true })

    expect(snapshots.at(-1)?.attempt.kind).toBe('working')

    const settled = await committed.promise
    expect(settled.desired?.filename).toBe('acme-logo.svg')
    expect(settled.desired?.bundleName).toBe('acme-logo')
    expect(settled.committed?.writtenTo).toBe(join(root, 'acme-logo'))
    expect(settled.committed?.bundleName).toBe('acme-logo')
    expect(settled.matchesDesired).toBe(true)
  })

  test('a Bundle Name owned by another Source Mark recovers without replacing it', async () => {
    const root = tempRoot()
    const occupied = join(root, 'acme-logo')
    mkdirSync(occupied, { recursive: true })
    const originalSidecar = JSON.stringify({
      sourceHash: 'another-source-mark',
      bundleName: 'acme-logo',
      generatedAt: '2026-01-02T03:04:05.000Z',
      settings: defaultSettings,
    })
    writeFileSync(join(occupied, SIDECAR_FILENAME), originalSidecar)

    const committed = deferredSnapshot()
    const session = createAssetBundleSession({
      pipeline,
      render: createRenderCache((sourceSvg, darkSvg, settings) =>
        pipeline.render(sourceSvg, darkSvg, settings),
      ),
      outputRoot: root,
      publish(snapshot) {
        if (snapshot.attempt.kind === 'idle' && snapshot.committed !== null) {
          committed.resolve(snapshot)
        }
      },
    })

    session.accept({
      kind: 'open-source',
      sourceSvg: fixture('square-tight'),
      filename: 'acme-logo.svg',
    })

    const settled = await committed.promise
    expect(settled.desired?.bundleName).toBe('acme-logo-2')
    expect(settled.committed?.writtenTo).toBe(join(root, 'acme-logo-2'))
    expect(settled.recoveryNotice).toContain('acme-logo-2')
    expect(readFileSync(join(occupied, SIDECAR_FILENAME), 'utf8')).toBe(originalSidecar)
  })

  test('reopening a recovered Source Mark reuses its matching suffixed Sidecar', async () => {
    const root = tempRoot()
    const sourceSvg = fixture('square-tight')
    const chosen = { ...defaultSettings, name: 'Remembered Acme', themeColor: '#123456' as const }

    for (const [name, sourceHash, settings] of [
      ['acme-logo', 'another-source-mark', defaultSettings],
      ['acme-logo-2', hashSource(sourceSvg), chosen],
    ] as const) {
      const dir = join(root, name)
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        join(dir, SIDECAR_FILENAME),
        JSON.stringify({
          sourceHash,
          bundleName: name,
          generatedAt: '2026-01-02T03:04:05.000Z',
          settings,
        }),
      )
    }

    const committed = deferredSnapshot()
    const session = createAssetBundleSession({
      pipeline,
      render: createRenderCache((source, dark, settings) =>
        pipeline.render(source, dark, settings),
      ),
      outputRoot: root,
      publish(snapshot) {
        if (snapshot.attempt.kind === 'idle' && snapshot.committed !== null) {
          committed.resolve(snapshot)
        }
      },
    })

    session.accept({ kind: 'open-source', sourceSvg, filename: 'acme-logo.svg' })

    const settled = await committed.promise
    expect(settled.desired?.bundleName).toBe('acme-logo-2')
    expect(settled.desired?.settings).toEqual(chosen)
    expect(settled.committed?.writtenTo).toBe(join(root, 'acme-logo-2'))
  })

  test('rapid Settings edits commit only the newest desired state', async () => {
    const root = tempRoot()
    const scheduler = fakeScheduler()
    const snapshots: AssetBundleSessionSnapshot[] = []
    let renders = 0
    const session = createAssetBundleSession({
      pipeline,
      render(source, dark, settings) {
        renders += 1
        return pipeline.render(source, dark, settings)
      },
      outputRoot: root,
      scheduler,
      publish(snapshot) {
        snapshots.push(snapshot)
      },
    })

    session.accept({
      kind: 'open-source',
      sourceSvg: fixture('square-tight'),
      filename: 'acme-logo.svg',
    })
    await scheduler.flush()
    expect(renders).toBe(1)

    session.accept({ kind: 'patch-settings', change: { iconBackground: '#111111' } })
    session.accept({ kind: 'patch-settings', change: { iconBackground: '#222222' } })

    expect(snapshots.at(-1)?.desired?.settings?.iconBackground).toBe('#222222')
    expect(snapshots.at(-1)?.attempt.kind).toBe('working')
    expect(renders).toBe(1)

    await scheduler.flush()

    expect(renders).toBe(2)
    expect(snapshots.at(-1)?.committed?.settings.iconBackground).toBe('#222222')
    expect(snapshots.at(-1)?.matchesDesired).toBe(true)
  })

  test('a failed target change preserves committed state until explicit retry', async () => {
    const root = tempRoot()
    const blockedRoot = join(root, 'not-a-directory')
    const scheduler = fakeScheduler()
    const snapshots: AssetBundleSessionSnapshot[] = []
    const session = createAssetBundleSession({
      pipeline,
      render: createRenderCache((source, dark, settings) =>
        pipeline.render(source, dark, settings),
      ),
      outputRoot: root,
      scheduler,
      publish(snapshot) {
        snapshots.push(snapshot)
      },
    })

    session.accept({
      kind: 'open-source',
      sourceSvg: fixture('square-tight'),
      filename: 'acme-logo.svg',
    })
    await scheduler.flush()
    const original = snapshots.at(-1)?.committed
    expect(original?.writtenTo).toBe(join(root, 'acme-logo'))

    writeFileSync(blockedRoot, 'occupied by a file')
    session.accept({ kind: 'change-output-root', outputRoot: blockedRoot })
    await scheduler.flush()

    expect(snapshots.at(-1)?.attempt.kind).toBe('failed')
    expect(snapshots.at(-1)?.desired?.outputRoot).toBe(blockedRoot)
    expect(snapshots.at(-1)?.committed).toEqual(original ?? null)
    expect(snapshots.at(-1)?.matchesDesired).toBe(false)
    expect(readFileSync(join(root, 'acme-logo', SIDECAR_FILENAME), 'utf8')).toContain(
      '"bundleName": "acme-logo"',
    )

    rmSync(blockedRoot)
    session.accept({ kind: 'retry' })
    const retrying = snapshots.at(-1)?.attempt
    expect(retrying?.kind).toBe('working')
    expect(retrying?.kind === 'working' ? typeof retrying.previousError : null).toBe('string')
    await scheduler.flush()

    expect(snapshots.at(-1)?.attempt.kind).toBe('idle')
    expect(snapshots.at(-1)?.committed?.writtenTo).toBe(join(blockedRoot, 'acme-logo'))
    expect(snapshots.at(-1)?.matchesDesired).toBe(true)
  })

  test('an in-flight render cannot commit after newer desired state is accepted', async () => {
    const root = tempRoot()
    const scheduler = fakeScheduler()
    const snapshots: AssetBundleSessionSnapshot[] = []
    const slowRender = deferred<RenderedMark>()
    let renders = 0
    const sourceSvg = fixture('square-tight')
    const session = createAssetBundleSession({
      pipeline,
      render(source, dark, settings) {
        renders += 1
        return renders === 2 ? slowRender.promise : pipeline.render(source, dark, settings)
      },
      outputRoot: root,
      scheduler,
      publish(snapshot) {
        snapshots.push(snapshot)
      },
    })

    session.accept({ kind: 'open-source', sourceSvg, filename: 'acme-logo.svg' })
    await scheduler.flush()
    const original = snapshots.at(-1)?.committed

    session.accept({ kind: 'patch-settings', change: { iconBackground: '#111111' } })
    await scheduler.flush()
    expect(renders).toBe(2)

    session.accept({ kind: 'patch-settings', change: { iconBackground: '#222222' } })
    await scheduler.flush()
    expect(renders).toBe(2)

    slowRender.resolve(
      pipeline.render(sourceSvg, null, {
        iconBackground: '#111111',
        optimizeSvg: true,
      }),
    )
    await Promise.resolve()
    await Promise.resolve()

    expect(snapshots.at(-1)?.committed).toEqual(original ?? null)
    expect(snapshots.at(-1)?.matchesDesired).toBe(false)

    await scheduler.flush()
    expect(snapshots.at(-1)?.committed?.settings.iconBackground).toBe('#222222')
    expect(snapshots.at(-1)?.matchesDesired).toBe(true)
  })

  test('Bundle Name intent validates drafts and recovers from an unknown folder', async () => {
    const root = tempRoot()
    const scheduler = fakeScheduler()
    const snapshots: AssetBundleSessionSnapshot[] = []
    const session = createAssetBundleSession({
      pipeline,
      render: createRenderCache((source, dark, settings) =>
        pipeline.render(source, dark, settings),
      ),
      outputRoot: root,
      scheduler,
      publish(snapshot) {
        snapshots.push(snapshot)
      },
    })
    session.accept({
      kind: 'open-source',
      sourceSvg: fixture('square-tight'),
      filename: 'acme-logo.svg',
    })
    await scheduler.flush()

    const beforeInvalid = snapshots.at(-1)
    expect(session.accept({ kind: 'commit-bundle-name', bundleName: '../outside' }).ok).toBe(false)
    expect(snapshots.at(-1)).toEqual(beforeInvalid)

    const unknown = join(root, 'new-name')
    mkdirSync(unknown)
    writeFileSync(join(unknown, 'notes.txt'), 'not owned by Manifesto')
    expect(session.accept({ kind: 'commit-bundle-name', bundleName: 'new-name' })).toEqual({
      ok: true,
    })
    await scheduler.flush()

    expect(snapshots.at(-1)?.desired?.bundleName).toBe('new-name-2')
    expect(snapshots.at(-1)?.committed?.writtenTo).toBe(join(root, 'new-name-2'))
    expect(snapshots.at(-1)?.recoveryNotice).toContain('new-name-2')
    expect(readFileSync(join(unknown, 'notes.txt'), 'utf8')).toBe('not owned by Manifesto')
  })

  test('attaching and clearing a Dark Mark are immediate session intents', async () => {
    const root = tempRoot()
    const scheduler = fakeScheduler()
    const snapshots: AssetBundleSessionSnapshot[] = []
    const session = createAssetBundleSession({
      pipeline,
      render: createRenderCache((source, dark, settings) =>
        pipeline.render(source, dark, settings),
      ),
      outputRoot: root,
      scheduler,
      publish(snapshot) {
        snapshots.push(snapshot)
      },
    })
    session.accept({
      kind: 'open-source',
      sourceSvg: fixture('square-tight'),
      filename: 'acme-logo.svg',
    })
    await scheduler.flush()

    session.accept({
      kind: 'set-dark-mark',
      darkSvg: fixture('light-mark'),
      darkFilename: 'acme-dark.svg',
    })
    expect(snapshots.at(-1)?.desired?.darkFilename).toBe('acme-dark.svg')
    await scheduler.flush()
    expect(snapshots.at(-1)?.matchesDesired).toBe(true)

    session.accept({ kind: 'clear-dark-mark' })
    expect(snapshots.at(-1)?.desired?.darkFilename).toBeNull()
    await scheduler.flush()
    expect(snapshots.at(-1)?.matchesDesired).toBe(true)
  })

  test('an invalid replacement starts a new session and does not restore the old commit', async () => {
    const root = tempRoot()
    const scheduler = fakeScheduler()
    const snapshots: AssetBundleSessionSnapshot[] = []
    const session = createAssetBundleSession({
      pipeline,
      render: (source, dark, settings) => pipeline.render(source, dark, settings),
      outputRoot: root,
      scheduler,
      publish: (snapshot) => {
        snapshots.push(snapshot)
      },
    })

    session.accept({
      kind: 'open-source',
      sourceSvg: fixture('square-tight'),
      filename: 'valid.svg',
    })
    await scheduler.flush()
    expect(snapshots.at(-1)?.committed).not.toBeNull()

    session.accept({ kind: 'open-source', sourceSvg: '<svg>broken', filename: 'broken.svg' })
    expect(snapshots.at(-1)?.committed).toBeNull()
    await scheduler.flush()

    expect(snapshots.at(-1)?.attempt.kind).toBe('failed')
    expect(snapshots.at(-1)?.desired?.filename).toBe('broken.svg')
    expect(snapshots.at(-1)?.committed).toBeNull()
  })
})
