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

import { describeFailure, failureDetail } from '../host/failures.ts'
import { hashSource } from '../pipeline/index.ts'
import type { Pipeline, Settings } from '../pipeline/index.ts'
import type { BundleWire, GenerateRequest, GenerateResult, GenerateTrigger } from '../shared/rpc.ts'
import { inspectTarget, recallSettings, slugify, writeBundle } from './bundle-writer.ts'
import type { TargetState } from './bundle-writer.ts'
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
    ? `It holds icons Manifesto generated from a different logo on ${found.sidecar.generatedAt.slice(0, 10)}.`
    : "Manifesto didn't create it, so there's no way to know what's inside."
}

/**
 * May this request open a modal?
 *
 * Only when the user just chose the destination. An `edit` arrives every 150 ms while a
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

  return async function generate({
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
    const found = inspectTarget(join(root, requested), hashSource(sourceSvg))

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
    let finalName: string | null = requested
    if (found.kind === 'different-mark' || found.kind === 'unknown-folder') {
      finalName = mayPrompt(trigger)
        ? await resolveCollision(root, requested, describeTarget(found))
        : null
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

    // Not written: the user still gets the Bundle to look at, and the panel keeps working
    // — it just isn't on disk.
    if (finalName === null) return { ok: true, bundle: wire(null, requested) }

    const target = join(root, finalName)
    writeBundle(target, bundle, {
      sourceHash: bundle.sourceHash,
      bundleName: finalName,
      settings: resolved,
    })

    return { ok: true, bundle: wire(target, finalName) }
  }
}
