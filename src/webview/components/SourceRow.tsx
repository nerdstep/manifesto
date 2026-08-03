/**
 * What SVGO did to the Source Mark, and whether it was safe.
 *
 * The toggle lives here rather than in the settings panel because this is the only place
 * the user has evidence to decide with. "Optimize SVG" next to a byte delta and a
 * pixel-drift verdict is a decision; the same checkbox in a list of colours is a shrug.
 *
 * The verdict is not a claim that the markup is unchanged — it certainly is. It is a
 * claim about *pixels*, made by rendering both versions and comparing them, because
 * SVGO's classic breakages all produce valid SVG and only show up when drawn.
 *
 * The filename is not repeated here: the source pane above already names it, and saying
 * it twice on one screen is how a layout starts to feel padded.
 */

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
