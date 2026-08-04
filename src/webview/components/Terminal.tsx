import { BUNDLE_FILENAMES, SIDECAR_FILENAME } from '../../shared/bundle.ts'
import type { BundleWire } from '../../shared/rpc.ts'
import type { Status } from '../use-bundle.ts'

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

  const written =
    bundle === null ? [] : [...BUNDLE_FILENAMES].filter((name) => name in bundle.files)

  return (
    <section
      class="text-code mt-6 rounded-xl border border-line bg-surface font-mono"
      aria-label="Generation status"
    >
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-3">
        <span class="text-amber" aria-hidden="true">
          ›
        </span>
        <span class="text-ink">manifesto build</span>
        <span class="text-line-strong" aria-hidden="true">
          │
        </span>
        <span class="min-w-0" role="status" aria-live="polite" aria-atomic="true">
          <Result status={status} pending={pending} bundle={bundle} />
        </span>
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
          <p class="mt-2.5 text-sm text-dim">
            <span class="text-muted">{SIDECAR_FILENAME}</span> saves these settings for the next
            time you use this logo. You can delete it.
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
  if (status.kind === 'failed') return <span class="text-bad">✗ {status.error}</span>
  if (pending) return <span class="text-cyan">saving…</span>
  if (bundle === null) return null

  const count = Object.keys(bundle.files).length

  return bundle.writtenTo === null ? (
    <span class="text-bad">
      ✗ Nothing saved. <span class="text-ink">{bundle.bundleName}</span> already contains files
      Manifesto did not create. Rename the folder or choose another output folder.
    </span>
  ) : (
    <span class="text-ok">✓ {count} files written</span>
  )
}
