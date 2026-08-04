import { join } from 'node:path'

import {
  bundleNameProblem,
  inspectTarget,
  recallSettings,
  slugify,
  writeBundle,
} from '../host/bundle-writer.ts'
import type { TargetState } from '../host/bundle-writer.ts'
import { BundleWriteError, describeFailure, failureDetail } from '../host/failures.ts'
import { hashSource } from '../pipeline/index.ts'
import type { Pipeline, Settings } from '../pipeline/index.ts'
import type { BundleWire, GenerateRequest, GenerateResult, GenerateTrigger } from '../shared/rpc.ts'
import type { RenderFn } from './render-cache.ts'

export type ResolveCollision = (
  root: string,
  bundleName: string,
  detail: string,
) => Promise<string | null>

export type GenerateDeps = {
  pipeline: Pipeline
  render: RenderFn
  /** Read for each request because the output root can change. */
  outputRoot: () => string
  resolveCollision: ResolveCollision
}

function toBase64(files: Map<string, Uint8Array>): Record<string, string> {
  const wire: Record<string, string> = {}
  for (const [filename, bytes] of files) {
    wire[filename] = Buffer.from(bytes).toString('base64')
  }
  return wire
}

function describeTarget(found: TargetState): string {
  return found.kind === 'different-mark'
    ? `Manifesto generated the icons in this folder from a different logo on ${found.sidecar.generatedAt.slice(0, 10)}.`
    : 'Manifesto did not create this folder. Its contents are unknown.'
}

/** Routine edits never interrupt the user with a collision dialog. */
function mayPrompt(trigger: GenerateTrigger): boolean {
  return trigger !== 'edit'
}

function explain(error: unknown): string {
  console.error('[manifesto] generate failed:', failureDetail(error))
  return describeFailure(error)
}

const SUPERSEDED_RESULT: GenerateResult = {
  ok: false,
  error: 'This edit was superseded by a newer one.',
}

function isSameQueuedBundle(left: GenerateRequest, right: GenerateRequest): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.sourceSvg === right.sourceSvg &&
    left.bundleName === right.bundleName
  )
}

export function createGenerate(deps: GenerateDeps) {
  const { pipeline, render, outputRoot, resolveCollision } = deps

  /** Reuse Sidecar settings only when the source hash matches. */
  function openingSettings(
    found: TargetState,
    dir: string,
    sourceSvg: string,
    filename: string,
  ): Settings {
    const recalled = found.kind === 'same-mark' ? recallSettings(dir) : null
    return recalled ?? pipeline.inferSettings(sourceSvg, filename)
  }

  async function run({
    sourceSvg,
    filename,
    darkSvg,
    settings,
    bundleName,
    trigger,
  }: GenerateRequest): Promise<GenerateResult> {
    const root = outputRoot()

    // The manifest name never renames the output folder.
    const requested = bundleName ?? slugify(filename)
    const requestedProblem = bundleNameProblem(requested)
    if (requestedProblem !== null) return { ok: false, error: requestedProblem }

    let found: TargetState
    try {
      found = inspectTarget(join(root, requested), hashSource(sourceSvg))
    } catch (error) {
      return { ok: false, error: explain(new BundleWriteError(error)) }
    }

    let resolved: Settings
    let bundle
    try {
      resolved = settings ?? openingSettings(found, join(root, requested), sourceSvg, filename)
      // Reuse rendered bytes for metadata-only changes.
      bundle = pipeline.withManifest(render(sourceSvg, darkSvg, resolved), resolved)
    } catch (error) {
      return { ok: false, error: explain(error) }
    }

    const wire = (writtenTo: string | null, name: string): BundleWire => ({
      files: toBase64(bundle.files),
      advisories: bundle.advisories,
      sourceHash: bundle.sourceHash,
      originalBytes: bundle.originalBytes,
      optimizedBytes: bundle.optimizedBytes,
      writtenTo,
      bundleName: name,
      settings: resolved,
    })

    let finalName: string | null = requested
    try {
      if (found.kind === 'different-mark' || found.kind === 'unknown-folder') {
        finalName = mayPrompt(trigger)
          ? await resolveCollision(root, requested, describeTarget(found))
          : null
      }
    } catch (error) {
      return { ok: false, error: explain(error) }
    }

    if (finalName === null) return { ok: true, bundle: wire(null, requested) }

    // Validate names returned by any collision resolver.
    const finalNameProblem = bundleNameProblem(finalName)
    if (finalNameProblem !== null) return { ok: false, error: finalNameProblem }

    const target = join(root, finalName)
    try {
      writeBundle(target, bundle, {
        sourceHash: bundle.sourceHash,
        bundleName: finalName,
        settings: resolved,
      })
    } catch (error) {
      return { ok: false, error: explain(new BundleWriteError(error)) }
    }

    return { ok: true, bundle: wire(target, finalName) }
  }

  type Job = {
    request: GenerateRequest
    resolve: (result: GenerateResult) => void
  }

  const latestRevisions = new Map<string, number>()
  let running = false
  let pending: Job | null = null

  // Another request can update `pending` while `run()` awaits a dialog.
  const pendingAfterAwait = (): Job | null => pending

  /** Serialize writes and keep only the newest queued request. */
  async function drain(): Promise<void> {
    if (running) return
    running = true

    while (pending !== null) {
      const job = pending
      pending = null
      try {
        const result = await run(job.request)

        // Carry collision redirects into a newer queued edit.
        const next = pendingAfterAwait()
        if (
          result.ok &&
          next !== null &&
          result.bundle.bundleName !== job.request.bundleName &&
          isSameQueuedBundle(job.request, next.request)
        ) {
          next.request = { ...next.request, bundleName: result.bundle.bundleName }
        }

        job.resolve(result)
      } catch (error) {
        job.resolve({ ok: false, error: explain(error) })
      }
    }

    running = false
  }

  return function generate(request: GenerateRequest): Promise<GenerateResult> {
    const sessionId = request.sessionId ?? 'default'
    const latestRevision = latestRevisions.get(sessionId) ?? -1
    const revision = request.revision ?? latestRevision + 1
    if (revision < latestRevision) {
      return Promise.resolve(SUPERSEDED_RESULT)
    }
    latestRevisions.set(sessionId, revision)

    return new Promise<GenerateResult>((resolve) => {
      let queuedRequest: GenerateRequest = { ...request, revision, sessionId }
      if (pending !== null) {
        // Preserve explicit destination intent when coalescing a later edit.
        if (
          queuedRequest.trigger === 'edit' &&
          pending.request.trigger !== 'edit' &&
          isSameQueuedBundle(pending.request, queuedRequest)
        ) {
          queuedRequest = { ...queuedRequest, trigger: pending.request.trigger }
        }
        pending.resolve(SUPERSEDED_RESULT)
      }
      pending = { request: queuedRequest, resolve }
      void drain()
    })
  }
}
