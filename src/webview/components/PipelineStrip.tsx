import { ArrowRight, Crop, FileCode2, Layers, Scaling, Sparkles } from 'lucide-preact'
import type { LucideIcon } from 'lucide-preact'

import { ICON_FILENAMES } from '../../shared/bundle.ts'
import type { BundleWire } from '../../shared/rpc.ts'
import { Caption } from './ui.tsx'

export type PipelineState = 'idle' | 'working' | 'done'

type Props = {
  state: PipelineState
  bundle: BundleWire | null
}

const STAGE_ICON = {
  Parse: FileCode2,
  Normalize: Crop,
  Resize: Scaling,
  Optimize: Sparkles,
  Export: Layers,
} satisfies Record<string, LucideIcon>

type StageName = keyof typeof STAGE_ICON

function count(n: number, singular: string): string {
  return `${n} ${n === 1 ? singular : `${singular}s`}`
}

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
    <li
      class={`flex flex-1 basis-20 flex-col items-center justify-center gap-2 rounded-lg border bg-bg px-1.5 py-3.5 transition-colors duration-300 ease-signal ${tone}`}
    >
      <Icon class="size-5" aria-hidden />
      <span class="text-[9px] font-bold tracking-[0.12em] uppercase">{name}</span>
      {value !== null && <span class="font-mono text-[10px] text-amber">{value}</span>}
    </li>
  )
}

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
