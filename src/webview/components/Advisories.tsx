import type { Advisory } from '../../pipeline/index.ts'
import { describeAdvisory } from '../../shared/advisories.ts'

export function Advisories({ advisories }: { advisories: Advisory[] }) {
  if (advisories.length === 0) {
    return null
  }

  return (
    <section class="mt-5 space-y-2" aria-label="Things worth checking">
      {advisories.map((advisory, index) => (
        <div
          key={`${advisory.origin ?? 'source'}-${advisory.kind}-${index}`}
          class="rounded-lg border border-amber/40 bg-amber/8 px-3 py-2.5 text-ink"
        >
          {describeAdvisory(advisory)}
        </div>
      ))}
    </section>
  )
}
