/**
 * The Signal Path itself: source in on the left, artefacts out on the right.
 *
 * ## Why this does not animate stage by stage
 *
 * The obvious build is a sequence that lights each stage in turn. It would be a lie.
 * `render()` takes about 60 ms end to end, so a choreographed run would either flash past
 * unread or be padded with artificial delay to look impressive — inventing a wait the user
 * does not actually have.
 *
 * So the strip reports rather than performs. Every stage carries what it actually found,
 * which turns an illustration into instrumentation.
 *
 * ## What each stage reports
 *
 * Parse and Normalize have no number in the ordinary case, which is exactly why they get
 * one when there *is* something to say: Parse names the scripts it stripped, Normalize
 * names an aspect ratio too extreme to read at 16px. A bare `✓` means "ran, nothing to
 * report" — the same vocabulary the terminal line uses — rather than filling the slot for
 * the sake of symmetry.
 */

import { ArrowRight, Crop, FileCode2, Layers, Scaling, Sparkles } from 'lucide-preact'
import type { LucideIcon } from 'lucide-preact'

import { ICON_FILENAMES } from '../../shared/bundle.ts'
import type { BundleWire } from '../../shared/rpc.ts'
import { Caption } from './ui.tsx'

export type PipelineState = 'idle' | 'working' | 'done'

type Props = {
  state: PipelineState
  /** What actually came out, or `null` before anything has run. */
  bundle: BundleWire | null
}

/**
 * One icon per stage, each chosen for what the stage actually does rather than for
 * looking technical:
 *
 * - **Parse** reads the document and strips what must not run → a code file.
 * - **Normalize** trims to the painted extents and centres → a crop frame.
 * - **Resize** produces each Rendition at its final dimensions → scaling handles.
 * - **Optimize** is SVGO.
 * - **Export** writes several files at once → stacked layers.
 */
const STAGE_ICON = {
  Parse: FileCode2,
  Normalize: Crop,
  Resize: Scaling,
  Optimize: Sparkles,
  Export: Layers,
} satisfies Record<string, LucideIcon>

/** The five stages, in order. Keyed off the icon map so the two cannot disagree. */
type StageName = keyof typeof STAGE_ICON

/** `1 script` / `2 scripts`, without the `(s)` that means the writer gave up. */
function count(n: number, singular: string): string {
  return `${n} ${n === 1 ? singular : `${singular}s`}`
}

/**
 * What each stage has to say about this Bundle.
 *
 * Derived here rather than passed in five props, so "which fact belongs to which stage"
 * is one decision in one place.
 */
function report(bundle: BundleWire): Record<StageName, string> {
  const scripts = bundle.advisories.find((a) => a.kind === 'scripts-removed')
  const wordmark = bundle.advisories.find((a) => a.kind === 'wordmark')
  const saved = bundle.originalBytes > 0 ? 1 - bundle.optimizedBytes / bundle.originalBytes : 0

  return {
    Parse: scripts === undefined ? '✓' : `−${count(scripts.elements, 'script')}`,
    Normalize: wordmark === undefined ? '✓' : `${wordmark.aspectRatio.toFixed(1)}:1`,
    Resize: `${ICON_FILENAMES.length}×`,
    Optimize: bundle.settings.optimizeSvg ? `−${Math.round(saved * 100)}%` : 'off',
    Export: `${Object.keys(bundle.files).length} files`,
  }
}

function Stage({
  name,
  state,
  value,
}: {
  name: StageName
  state: PipelineState
  value: string | null
}) {
  const Icon = STAGE_ICON[name]
  const tone =
    state === 'working'
      ? 'border-cyan text-cyan ring-1 ring-cyan/40'
      : state === 'done'
        ? 'border-line-strong text-muted'
        : 'border-line text-dim'

  return (
    // `basis-20` (80px), not 22. The five stages plus four arrows and eight gaps have to
    // fit one row — at basis-22 that came to 544px against 540px of column and "Export"
    // wrapped. 80px leaves real slack instead of four pixels of it, and `flex-1` still
    // lets them fill whatever width there is.
    //
    // `justify-center`, and the value line is absent rather than an empty reserved box.
    // Reserving it kept the row from shifting, but it also parked the icon above centre
    // whenever there was nothing to report — which is every stage before a drop. Since
    // every stage reports *something* once a Bundle exists, they gain their value lines
    // together, so there is no ragged in-between state to protect against.
    <li
      class={`flex flex-1 basis-20 flex-col items-center justify-center gap-2 rounded-lg border bg-bg px-1.5 py-3.5 transition-colors duration-300 ease-signal ${tone}`}
    >
      <Icon class="size-5" aria-hidden />
      <span class="text-[9px] font-bold tracking-[0.12em] uppercase">{name}</span>
      {value !== null && <span class="font-mono text-[10px] text-amber">{value}</span>}
    </li>
  )
}

/**
 * `flex items-center`, not `block`.
 *
 * The row is `items-stretch`, so a block `<li>` grew to the full height of a stage tile
 * and left the arrow pinned to the top of that space — visibly high against the tiles it
 * sits between. Centring it inside the stretched box is what puts it on the tiles' axis.
 */
function Arrow() {
  return (
    <li aria-hidden="true" class="hidden shrink-0 items-center text-line-strong sm:flex">
      <ArrowRight class="size-3.5" />
    </li>
  )
}

export function PipelineStrip({ state, bundle }: Props) {
  const values = bundle === null ? null : report(bundle)
  const stages: StageName[] = ['Parse', 'Normalize', 'Resize', 'Optimize', 'Export']

  return (
    // `justify-center` so the stages sit on the source pane's optical centre when the two
    // share a row, rather than clinging to the top of a taller box.
    <section
      class="flex h-full flex-col justify-center rounded-xl border border-line bg-surface p-4"
      aria-label="Pipeline"
    >
      <ol class="flex flex-wrap items-stretch gap-1.5">
        {stages.map((name, i) => (
          <>
            {i > 0 && <Arrow key={`${name}-arrow`} />}
            <Stage key={name} name={name} state={state} value={values?.[name] ?? null} />
          </>
        ))}
      </ol>

      {/*
        The line under the stages runs cyan → amber: the whole point of the palette in one
        element. It fills only when there is something downstream to point at.
      */}
      <div class="mt-3 h-0.5 overflow-hidden rounded-full bg-line">
        <div
          class="h-full origin-left rounded-full bg-linear-to-r from-cyan to-amber transition-transform duration-300 ease-signal"
          style={{ transform: `scaleX(${state === 'idle' ? 0 : 1})` }}
        />
      </div>

      <Caption class="mt-3 block text-dim">
        {state === 'idle'
          ? 'Nothing rendered yet'
          : state === 'working'
            ? 'Rendering'
            : 'Each icon is rendered at its final size'}
      </Caption>
    </section>
  )
}
