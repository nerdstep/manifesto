/**
 * Advisories: things worth knowing that do not stop generation.
 *
 * Wording lives in `src/shared/advisories.ts` so the app and the CLI say the same thing
 * about the same file. Every one names an action — the user decides, and a warning they
 * cannot act on is noise.
 */

import type { Advisory } from '../../pipeline/index.ts'
import { describeAdvisory } from '../../shared/advisories.ts'

export function Advisories({ advisories }: { advisories: Advisory[] }) {
  if (advisories.length === 0) return null

  return (
    <section class="mt-5 space-y-2" aria-label="Things worth checking">
      {advisories.map((advisory) => (
        <div
          key={advisory.kind}
          class="rounded-lg border border-amber/40 bg-amber/8 px-3 py-2.5 text-[13px] text-ink"
        >
          {describeAdvisory(advisory)}
        </div>
      ))}
    </section>
  )
}
