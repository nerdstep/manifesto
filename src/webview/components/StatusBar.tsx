import type { AssetBundleSessionSnapshot } from '../../shared/rpc.ts'
import { cn } from '../utils/index.ts'

type Status = { label: string; dot: string }

/**
 * The one line that stays on screen when everything else has scrolled away.
 *
 * It reports the same four states the Terminal does, and deliberately is not a live
 * region: the Terminal already announces them, and two `role="status"` nodes reporting
 * one event announce it twice.
 */
function status(snapshot: AssetBundleSessionSnapshot): Status {
  if (snapshot.desired === null) {
    return { label: 'Waiting for a logo', dot: 'bg-line-strong' }
  }
  if (snapshot.attempt.kind === 'failed') {
    return { label: 'Generation failed', dot: 'bg-bad' }
  }
  if (snapshot.attempt.kind === 'working') {
    return {
      label: snapshot.committed === null ? 'Rendering' : 'Saving',
      dot: 'bg-cyan',
    }
  }
  if (snapshot.committed === null) {
    return { label: 'Waiting for a logo', dot: 'bg-line-strong' }
  }

  const count = Object.keys(snapshot.committed.files).length
  return {
    label: `${count} ${count === 1 ? 'file' : 'files'} written`,
    dot: snapshot.committed.writtenTo === null ? 'bg-line-strong' : 'bg-ok',
  }
}

export function StatusBar({
  snapshot,
  outputRoot,
}: {
  snapshot: AssetBundleSessionSnapshot
  outputRoot: string
}) {
  const { label, dot } = status(snapshot)
  const filename = snapshot.desired?.filename ?? null
  const destination = snapshot.committed?.writtenTo ?? outputRoot

  return (
    <footer class="flex h-8 shrink-0 items-center gap-2.5 border-t border-line bg-bg px-3 select-none">
      <span aria-hidden="true" class={cn('size-1.5 shrink-0 rounded-full', dot)} />
      <span class="shrink-0 text-muted">{label}</span>

      {filename !== null && (
        <>
          <span aria-hidden="true" class="shrink-0 text-line-strong">
            │
          </span>
          <span class="text-code min-w-0 truncate font-mono text-dim" title={filename}>
            {filename}
          </span>
        </>
      )}

      <span class="text-code ml-auto min-w-0 truncate font-mono text-dim" title={destination}>
        {destination}
      </span>
    </footer>
  )
}
