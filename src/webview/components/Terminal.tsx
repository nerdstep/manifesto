import { BUNDLE_FILENAMES, SIDECAR_FILENAME } from '../../shared/bundle.ts'
import type { AssetBundleSessionSnapshot, BundleWire } from '../../shared/rpc.ts'

function decodedBytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4)
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`
}

export function Terminal({
  snapshot,
  outputRoot,
}: {
  snapshot: AssetBundleSessionSnapshot
  outputRoot: string
}) {
  const bundle = snapshot.committed

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
          <Result snapshot={snapshot} bundle={bundle} />
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
  snapshot,
  bundle,
}: {
  snapshot: AssetBundleSessionSnapshot
  bundle: BundleWire | null
}) {
  if (snapshot.desired === null) {
    return <span class="text-dim">waiting for a logo</span>
  }
  if (snapshot.attempt.kind === 'failed') {
    return <span class="text-bad">✗ {snapshot.attempt.error}</span>
  }
  if (snapshot.attempt.kind === 'working') {
    return <span class="text-cyan">{bundle === null ? 'rendering…' : 'saving…'}</span>
  }
  if (bundle === null) {
    return null
  }

  const count = Object.keys(bundle.files).length

  return <span class="text-ok">✓ {count} files written</span>
}
