import type { Advisory } from '../../pipeline/index.ts'
import { Panel } from './ui.tsx'

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`
}

type Props = {
  originalBytes: number
  optimizedBytes: number
  optimizeSvg: boolean
  advisories: Advisory[]
  onToggle: (next: boolean) => void
}

export function SourceRow({
  originalBytes,
  optimizedBytes,
  optimizeSvg,
  advisories,
  onToggle,
}: Props) {
  const driftCandidate = advisories.find((advisory) => advisory.kind === 'svgo-pixel-drift')
  const drift = driftCandidate?.origin === 'dark' ? undefined : driftCandidate
  const saved = originalBytes === 0 ? 0 : 1 - optimizedBytes / originalBytes

  return (
    <Panel class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-[13px]">
      {optimizeSvg ? (
        <>
          <span class="font-mono text-muted">
            {formatBytes(originalBytes)} → {formatBytes(optimizedBytes)}{' '}
            <span class={saved > 0 ? 'text-ok' : 'text-muted'}>
              ({saved >= 0 ? '−' : '+'}
              {Math.abs(Math.round(saved * 100))}%)
            </span>
          </span>

          {drift === undefined ? (
            <span class="text-ok">✓ No visible change</span>
          ) : (
            <span class="text-amber">
              ⚠ Optimization changed {drift.percent.toFixed(2)}% of pixels. Compare the previews.
            </span>
          )}
        </>
      ) : (
        <span class="font-mono text-muted">{formatBytes(originalBytes)}, not optimized</span>
      )}

      <label class="ml-auto flex shrink-0 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={optimizeSvg}
          class="size-4 accent-cyan"
          onChange={(event) => {
            onToggle(event.currentTarget.checked)
          }}
        />
        <span>Optimize SVG</span>
      </label>
    </Panel>
  )
}
