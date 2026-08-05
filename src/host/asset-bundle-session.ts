import { join } from 'node:path'

import type { Pipeline, RenderedMark, RenderSettings } from '../pipeline/index.ts'
import type {
  AcceptIntentResult,
  AssetBundleIntent,
  AssetBundleSessionDesired,
  AssetBundleSessionSnapshot,
  BundleWire,
} from '../shared/rpc.ts'
import { resolveTarget } from './bundle-target.ts'
import { bundleNameProblem, recallSettings, slugify, writeBundle } from './bundle-writer.ts'
import { BundleWriteError, describeFailure, failureDetail } from './failures.ts'

type Render = (
  sourceSvg: string,
  darkSvg: string | null,
  settings: RenderSettings,
) => RenderedMark | Promise<RenderedMark>

export type AssetBundleSessionDeps = {
  pipeline: Pipeline
  render: Render
  outputRoot: string | (() => string)
  publish: (snapshot: AssetBundleSessionSnapshot) => void
  scheduler?: AssetBundleSessionScheduler
}

export type AssetBundleSessionScheduler = {
  schedule: (task: () => void, delayMs: number) => () => void
}

const EDIT_QUIET_WINDOW_MS = 150

const nativeScheduler: AssetBundleSessionScheduler = {
  schedule(task, delayMs) {
    const timer = setTimeout(task, delayMs)
    return () => {
      clearTimeout(timer)
    }
  },
}

function toBase64(files: Map<string, Uint8Array>): Record<string, string> {
  const wire: Record<string, string> = {}
  for (const [filename, bytes] of files) {
    wire[filename] = Buffer.from(bytes).toString('base64')
  }
  return wire
}

export function createAssetBundleSession(deps: AssetBundleSessionDeps) {
  const { pipeline, render, publish } = deps
  const scheduler = deps.scheduler ?? nativeScheduler
  let desired: AssetBundleSessionDesired | null = null
  let snapshot: AssetBundleSessionSnapshot = {
    desired: null,
    attempt: { kind: 'idle' },
    committed: null,
    matchesDesired: false,
    recoveryNotice: null,
  }
  let revision = 0
  let pendingRevision: number | null = null
  let pendingDelay = 0
  let cancelScheduled: (() => void) | null = null
  let running = false
  let restoreSettingsRevision: number | null = null

  function currentOutputRoot(): string {
    return typeof deps.outputRoot === 'function' ? deps.outputRoot() : deps.outputRoot
  }

  function update(change: Partial<AssetBundleSessionSnapshot>): void {
    snapshot = { ...snapshot, ...change, desired }
    publish(snapshot)
  }

  async function generate(attemptRevision: number): Promise<void> {
    const next = desired
    if (next === null) {
      return
    }

    try {
      const resolved = resolveTarget(next)
      const shouldRestoreSettings = restoreSettingsRevision === attemptRevision
      const recalled =
        shouldRestoreSettings && resolved.found.kind === 'same-mark'
          ? recallSettings(join(resolved.desired.outputRoot, resolved.desired.bundleName))
          : null
      const settings =
        recalled ?? next.settings ?? pipeline.inferSettings(next.sourceSvg, next.filename)
      if (attemptRevision !== revision || desired === null) {
        return
      }

      desired = { ...resolved.desired, settings }
      update({
        attempt: workingAttempt(),
        matchesDesired: false,
        recoveryNotice: resolved.notice ?? snapshot.recoveryNotice,
      })

      const current = desired
      const rendered = await render(current.sourceSvg, current.darkSvg, settings)
      if (attemptRevision !== revision || desired === null) {
        return
      }
      const bundle = pipeline.withManifest(rendered, settings)

      const target = join(desired.outputRoot, desired.bundleName)
      try {
        writeBundle(target, bundle, {
          sourceHash: bundle.sourceHash,
          bundleName: desired.bundleName,
          settings,
        })
      } catch (error) {
        throw new BundleWriteError(error)
      }

      const committed: BundleWire = {
        files: toBase64(bundle.files),
        advisories: bundle.advisories,
        sourceHash: bundle.sourceHash,
        originalBytes: bundle.originalBytes,
        optimizedBytes: bundle.optimizedBytes,
        writtenTo: target,
        bundleName: desired.bundleName,
        settings,
      }
      update({ committed, attempt: { kind: 'idle' }, matchesDesired: true })
    } catch (error) {
      console.error('[manifesto] session generation failed:', failureDetail(error))
      if (attemptRevision === revision) {
        update({
          attempt: { kind: 'failed', error: describeFailure(error) },
          matchesDesired: false,
        })
      }
    }
  }

  function armPending(): void {
    if (running || pendingRevision === null) {
      return
    }
    cancelScheduled?.()
    cancelScheduled = scheduler.schedule(() => {
      cancelScheduled = null
      const mine = pendingRevision
      pendingRevision = null
      if (mine === null) {
        return
      }
      running = true
      void generate(mine).finally(() => {
        running = false
        armPending()
      })
    }, pendingDelay)
  }

  function requestGeneration(delayMs: number): void {
    pendingRevision = revision
    pendingDelay = delayMs
    armPending()
  }

  function workingAttempt(): AssetBundleSessionSnapshot['attempt'] {
    const previousError =
      snapshot.attempt.kind === 'failed'
        ? snapshot.attempt.error
        : snapshot.attempt.kind === 'working'
          ? snapshot.attempt.previousError
          : null
    return { kind: 'working', previousError }
  }

  function beginDesiredChange(
    next: AssetBundleSessionDesired,
    delayMs: number,
    restoreSettings = false,
  ): void {
    revision += 1
    desired = next
    restoreSettingsRevision = restoreSettings ? revision : null
    update({ attempt: workingAttempt(), matchesDesired: false })
    requestGeneration(delayMs)
  }

  function accept(intent: AssetBundleIntent): AcceptIntentResult {
    if (intent.kind === 'retry') {
      if (desired === null || snapshot.attempt.kind !== 'failed') {
        return { ok: false, error: 'There is no failed write to try again.' }
      }
      beginDesiredChange(desired, 0)
      return { ok: true }
    }

    if (intent.kind === 'change-output-root') {
      if (desired === null) {
        return { ok: false, error: 'Open a logo before changing the output folder.' }
      }
      if (intent.outputRoot === desired.outputRoot) {
        return { ok: true }
      }
      beginDesiredChange({ ...desired, outputRoot: intent.outputRoot }, 0, true)
      return { ok: true }
    }

    if (intent.kind === 'commit-bundle-name') {
      if (desired === null) {
        return { ok: false, error: 'Open a logo before changing the folder name.' }
      }
      const problem = bundleNameProblem(intent.bundleName)
      if (problem !== null) {
        return { ok: false, error: problem }
      }
      if (intent.bundleName === desired.bundleName) {
        return { ok: true }
      }
      beginDesiredChange({ ...desired, bundleName: intent.bundleName }, 0, true)
      return { ok: true }
    }

    if (intent.kind === 'set-dark-mark') {
      if (desired === null) {
        return { ok: false, error: 'Open a logo before attaching a dark-mode logo.' }
      }
      beginDesiredChange(
        {
          ...desired,
          darkSvg: intent.darkSvg,
          darkFilename: intent.darkFilename,
        },
        0,
      )
      return { ok: true }
    }

    if (intent.kind === 'clear-dark-mark') {
      if (desired === null) {
        return { ok: false, error: 'Open a logo before removing its dark-mode logo.' }
      }
      if (desired.darkSvg === null) {
        return { ok: true }
      }
      beginDesiredChange({ ...desired, darkSvg: null, darkFilename: null }, 0)
      return { ok: true }
    }

    if (intent.kind === 'patch-settings') {
      if (desired?.settings === null || desired === null) {
        return { ok: false, error: 'Open a logo before changing its options.' }
      }
      beginDesiredChange(
        { ...desired, settings: { ...desired.settings, ...intent.change } },
        EDIT_QUIET_WINDOW_MS,
      )
      return { ok: true }
    }

    revision += 1
    desired = {
      sourceSvg: intent.sourceSvg,
      filename: intent.filename,
      darkSvg: null,
      darkFilename: null,
      settings: null,
      bundleName: slugify(intent.filename),
      outputRoot: currentOutputRoot(),
    }
    snapshot = {
      desired,
      attempt: { kind: 'working', previousError: null },
      committed: null,
      matchesDesired: false,
      recoveryNotice: null,
    }
    restoreSettingsRevision = revision
    publish(snapshot)
    requestGeneration(0)
    return { ok: true }
  }

  function publishCurrent(): void {
    publish(snapshot)
  }

  return { accept, publishCurrent }
}
