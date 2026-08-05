import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createAssetBundleSession } from '../src/host/asset-bundle-session.ts'
import { SIDECAR_FILENAME } from '../src/host/bundle-writer.ts'
import { hashSource } from '../src/pipeline/index.ts'
import type { Pipeline, Settings } from '../src/pipeline/index.ts'
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
  const root = mkdtempSync(join(tmpdir(), 'manifesto-targets-'))
  roots.push(root)
  return root
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

function sidecar(root: string, name: string, sourceHash: string, settings: Settings): void {
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

function setup(root: string) {
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
  return { scheduler, snapshots, session }
}

describe('Asset Bundle Session target behavior', () => {
  test('a direct matching folder restores saved settings after a rename', async () => {
    const root = tempRoot()
    const sourceSvg = fixture('square-tight')
    const remembered = { ...defaultSettings, name: 'Remembered', themeColor: '#123456' as const }
    sidecar(root, 'remembered', hashSource(sourceSvg), remembered)
    const { scheduler, snapshots, session } = setup(root)

    session.accept({ kind: 'open-source', sourceSvg, filename: 'fresh.svg' })
    await scheduler.flush()
    session.accept({ kind: 'commit-bundle-name', bundleName: 'remembered' })
    await scheduler.flush()

    expect(snapshots.at(-1)?.desired?.settings).toEqual(remembered)
    expect(snapshots.at(-1)?.committed?.settings).toEqual(remembered)
  })

  test('changing roots restores settings from a matching folder', async () => {
    const firstRoot = tempRoot()
    const secondRoot = tempRoot()
    const sourceSvg = fixture('square-tight')
    const remembered = { ...defaultSettings, shortName: 'Saved', optimizeSvg: false }
    sidecar(secondRoot, 'acme', hashSource(sourceSvg), remembered)
    const { scheduler, snapshots, session } = setup(firstRoot)

    session.accept({ kind: 'open-source', sourceSvg, filename: 'acme.svg' })
    await scheduler.flush()
    session.accept({ kind: 'change-output-root', outputRoot: secondRoot })
    await scheduler.flush()

    expect(snapshots.at(-1)?.desired?.settings).toEqual(remembered)
    expect(snapshots.at(-1)?.committed?.writtenTo).toBe(join(secondRoot, 'acme'))
  })

  test('a suffixed request continues forward and does not fill earlier gaps', async () => {
    const root = tempRoot()
    const sourceSvg = fixture('square-tight')
    sidecar(root, 'acme-3', 'different-source', defaultSettings)
    sidecar(root, 'acme-4', 'different-source', defaultSettings)
    const { scheduler, snapshots, session } = setup(root)

    session.accept({ kind: 'open-source', sourceSvg, filename: 'acme-3.svg' })
    await scheduler.flush()

    expect(snapshots.at(-1)?.desired?.bundleName).toBe('acme-5')
    expect(snapshots.at(-1)?.committed?.writtenTo).toBe(join(root, 'acme-5'))
    expect(snapshots.at(-1)?.recoveryNotice).toContain('acme-5')
  })

  test('an empty requested folder is used without recovery', async () => {
    const root = tempRoot()
    mkdirSync(join(root, 'empty-logo'))
    const { scheduler, snapshots, session } = setup(root)

    session.accept({
      kind: 'open-source',
      sourceSvg: fixture('square-tight'),
      filename: 'empty-logo.svg',
    })
    await scheduler.flush()

    expect(snapshots.at(-1)?.desired?.bundleName).toBe('empty-logo')
    expect(snapshots.at(-1)?.recoveryNotice).toBeNull()
  })
})
