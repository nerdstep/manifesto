/**
 * The Source Mark line: what SVGO did, and whether it was safe.
 *
 * The toggle lives here rather than in the settings panel because this is the only place
 * the user has evidence to decide with. "Optimize SVG" next to a byte delta and a
 * pixel-drift verdict is a decision; the same checkbox in a list of colours is a shrug.
 *
 * The verdict is not a claim that the markup is unchanged — it certainly is. It is a
 * claim about *pixels*, made by rendering both versions and comparing them, because
 * SVGO's classic breakages all produce valid SVG and only show up when drawn.
 */

import type { Advisory } from '../../pipeline/index.ts'

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`
}

type Props = {
  filename: string
  originalBytes: number
  optimizedBytes: number
  optimizeSvg: boolean
  advisories: Advisory[]
  onToggle: (next: boolean) => void
}

export function SourceRow({
  filename,
  originalBytes,
  optimizedBytes,
  optimizeSvg,
  advisories,
  onToggle,
}: Props) {
  const drift = advisories.find((advisory) => advisory.kind === 'svgo-pixel-drift')
  const saved = originalBytes === 0 ? 0 : 1 - optimizedBytes / originalBytes

  return (
    <section class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-[13px]">
      <span class="font-mono">{filename}</span>

      {optimizeSvg ? (
        <>
          <span class="text-muted">
            {formatBytes(originalBytes)} → {formatBytes(optimizedBytes)}{' '}
            <span class={saved > 0 ? 'text-ok' : 'text-muted'}>
              ({saved >= 0 ? '−' : '+'}
              {Math.abs(Math.round(saved * 100))}%)
            </span>
          </span>

          {drift === undefined ? (
            <span class="text-ok">✓ No visible change</span>
          ) : (
            <span class="text-warn">
              ⚠ Changed {drift.percent.toFixed(2)}% of pixels — compare the previews
            </span>
          )}
        </>
      ) : (
        <span class="text-muted">{formatBytes(originalBytes)} — not optimized</span>
      )}

      <label class="ml-auto flex shrink-0 items-center gap-2">
        <input
          type="checkbox"
          checked={optimizeSvg}
          class="size-4 accent-accent"
          onChange={(event) => {
            onToggle(event.currentTarget.checked)
          }}
        />
        <span>Optimize SVG</span>
      </label>
    </section>
  )
}
