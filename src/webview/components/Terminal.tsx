/**
 * The downstream end of the Signal Path: the command, the result, and what it wrote.
 *
 * The file list used to be its own card with its own heading, one section below this one —
 * so "7 files written" and the seven filenames were separated by a card boundary and a
 * gap, saying the same thing twice in two voices. A terminal that reports a build and then
 * prints what it produced is one thought, and it is the shape this readout was already
 * borrowing.
 *
 * A polite live region: it updates on every debounced edit, and interrupting someone
 * mid-word to say "saved" is worse than telling them a moment later.
 */

import { BUNDLE_FILENAMES, SIDECAR_FILENAME } from '../../shared/bundle.ts'
import type { BundleWire } from '../../shared/rpc.ts'
import type { Status } from '../use-bundle.ts'

/** base64 is 4 characters per 3 bytes — close enough for a size column. */
function decodedBytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4)
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`
}

export function Terminal({
  status,
  pending,
  outputRoot,
}: {
  status: Status
  pending: boolean
  outputRoot: string
}) {
  const bundle = status.kind === 'done' ? status.bundle : null

  // Listed in the documented order, so the UI reads the way the docs do.
  const written =
    bundle === null ? [] : [...BUNDLE_FILENAMES].filter((name) => name in bundle.files)

  return (
    <section
      class="mt-6 rounded-xl border border-line bg-surface font-mono text-xs"
      role="status"
      aria-live="polite"
    >
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-3">
        <span class="text-amber" aria-hidden="true">
          ›
        </span>
        <span class="text-ink">manifesto build</span>
        <span class="text-line-strong" aria-hidden="true">
          │
        </span>
        <Result status={status} pending={pending} bundle={bundle} />
        <span class="ml-auto truncate text-muted" title={bundle?.writtenTo ?? outputRoot}>
          {bundle?.writtenTo ?? outputRoot}
        </span>
      </div>

      {bundle !== null && written.length > 0 && (
        <div class="border-t border-line px-4 py-3">
          <ul>
            {written.map((filename) => (
              <li key={filename} class="flex items-baseline justify-between gap-4 py-0.5">
                <span class="truncate text-muted">{filename}</span>
                <span class="shrink-0 text-dim">
                  {formatBytes(decodedBytes(bundle.files[filename] ?? ''))}
                </span>
              </li>
            ))}
          </ul>
          <p class="mt-2.5 text-[11px] text-dim">
            <span class="text-muted">{SIDECAR_FILENAME}</span> is written alongside these. It
            records the settings used, so re-dropping the same logo restores them. Deleting it is
            safe.
          </p>
        </div>
      )}
    </section>
  )
}

function Result({
  status,
  pending,
  bundle,
}: {
  status: Status
  pending: boolean
  bundle: BundleWire | null
}) {
  if (status.kind === 'idle') return <span class="text-dim">waiting for a logo</span>
  if (status.kind === 'working') return <span class="text-cyan">rendering…</span>
  if (status.kind === 'failed') return <span class="text-bad">✗ nothing generated</span>
  if (pending) return <span class="text-cyan">saving…</span>
  if (bundle === null) return null

  const count = Object.keys(bundle.files).length

  // `writtenTo === null` has exactly one cause: the target folder holds files Manifesto
  // did not write, and the user either declined to resolve it or the change was a
  // debounced edit that is never allowed to prompt. Both are the same situation and both
  // have the same two ways out.
  return bundle.writtenTo === null ? (
    <span class="text-bad">
      ✗ nothing saved — <span class="text-ink">{bundle.bundleName}</span> already holds files
      Manifesto did not write. Rename it above, or choose another folder.
    </span>
  ) : (
    <span class="text-ok">✓ {count} files written</span>
  )
}
