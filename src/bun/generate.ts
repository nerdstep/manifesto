/**
 * Drop → Asset Bundle on disk. The whole app in one operation.
 *
 * Separated from the window and RPC wiring because the interesting decisions live here —
 * which settings to open with, whether writing is safe, and whether this request is
 * allowed to interrupt the user — and none of them should need a native window to test.
 *
 * The collision prompt is injected rather than imported. That is the seam: in the app it
 * opens a modal message box, and in tests it is a function that returns an answer. It is a
 * real seam by the two-adapter rule, and it is the only way the trigger policy below is
 * checkable at all.
 */

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

/**
 * Ask the user what to do about a folder that is already occupied.
 *
 * Returns the Bundle Name to use, or `null` to write nothing.
 */
export type ResolveCollision = (
  root: string,
  bundleName: string,
  detail: string,
) => Promise<string | null>

export type GenerateDeps = {
  pipeline: Pipeline
  /** Usually the cached form — see `render-cache.ts`. */
  render: RenderFn
  /** Read fresh each call: the user can change the Output Root between requests. */
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

/** Why the folder that is already there counts as a collision. */
function describeTarget(found: TargetState): string {
  return found.kind === 'different-mark'
    ? `Manifesto generated the icons in this folder from a different logo on ${found.sidecar.generatedAt.slice(0, 10)}.`
    : 'Manifesto did not create this folder. Its contents are unknown.'
}

/**
 * May this request open a modal?
 *
 * Only when the user just chose the destination. An `edit` can arrive repeatedly while a
 * colour picker is being dragged, and a modal on each one would be unusable — so an edit
 * that lands on a folder we cannot write to safely simply does not write, and the panel
 * says so.
 */
function mayPrompt(trigger: GenerateTrigger): boolean {
  return trigger !== 'edit'
}

/**
 * Turn a thrown error into something the user can act on, and log what actually happened.
 *
 * The two halves are separate on purpose: `error.message` used to be returned straight to
 * the interface, which is how "resvg could not parse this SVG" reached a user who has
 * never heard of resvg and cannot do anything about it.
 */
function explain(error: unknown): string {
  console.error('[manifesto] generate failed:', failureDetail(error))
  return describeFailure(error)
}

const SUPERSEDED_RESULT: GenerateResult = {
  ok: false,
  error: 'This edit was superseded by a newer one.',
}

/** Requests that edit the same Bundle may safely share collision intent and redirects. */
function isSameQueuedBundle(left: GenerateRequest, right: GenerateRequest): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.sourceSvg === right.sourceSvg &&
    left.bundleName === right.bundleName
  )
}

/**
 * Build the `generate` RPC handler.
 *
 * @throws never — generation failures the user can act on come back as
 * `{ ok: false, error }`, because "your SVG is only text" is information, not an
 * exception to be stringified at a boundary.
 */
export function createGenerate(deps: GenerateDeps) {
  const { pipeline, render, outputRoot, resolveCollision } = deps

  /**
   * What the panel opens with on a fresh drop.
   *
   * A Sidecar for *this* mark beats inference every time: the user already answered these
   * questions for this logo, and re-guessing would silently discard their answers. The
   * hash match is what makes that safe — `same-mark` means the folder holds a Bundle built
   * from byte-identical source, so its recorded settings are about this artwork and no
   * other.
   */
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

    // The Bundle Name comes from the filename on a drop and from the panel after that. It
    // never follows `settings.name` — a rename in the manifest must not silently move
    // someone's folder.
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
      // Two halves, not `buildBundle`: the cache makes a metadata-only change reuse the
      // rendered bytes rather than producing identical ones again.
      bundle = pipeline.withManifest(render(sourceSvg, darkSvg, resolved), resolved)
    } catch (error) {
      return { ok: false, error: explain(error) }
    }

    // Writing is deliberate, never automatic, whenever anything is already there that we
    // did not put there ourselves.
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

    // Not written: the user still gets the Bundle to look at, and the panel keeps working
    // — it just isn't on disk.
    if (finalName === null) return { ok: true, bundle: wire(null, requested) }

    // Collision resolution is host-owned today, but validating its result keeps that
    // boundary safe if another resolver is introduced later.
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

  // Read through a function so TypeScript does not retain a pre-`await` null narrowing;
  // another RPC call can queue a job while `run()` is waiting on a collision dialog.
  const pendingAfterAwait = (): Job | null => pending

  /**
   * RPC calls can arrive faster than rasterization during a colour drag. Keep the newest
   * request while one is running; the serial drain means an older render can never finish
   * after a newer one and overwrite its files.
   */
  async function drain(): Promise<void> {
    if (running) return
    running = true

    while (pending !== null) {
      const job = pending
      pending = null
      try {
        const result = await run(job.request)

        // A collision resolver can redirect a running rename/root-change while a newer
        // edit is already queued. The older response will be ignored by the webview's
        // ticket, so carry the resolved Bundle Name into that latest edit before it runs.
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
        // `run()` translates expected failures, but keep the RPC contract total if a new
        // filesystem or pipeline failure appears in a future phase.
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
        // Keep explicit destination intent while adopting the latest fields. Otherwise a
        // rename/root-change followed by a keystroke becomes an ordinary edit and skips
        // the collision prompt the user explicitly requested.
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
