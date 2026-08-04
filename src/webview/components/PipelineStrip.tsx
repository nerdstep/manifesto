import { ArrowRight, Crop, FileCode2, Layers, Scaling, Sparkles } from 'lucide-preact'
import type { LucideIcon } from 'lucide-preact'
import { Fragment } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

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
type StagePhase = 'idle' | 'active' | 'reached' | 'done'

const STAGES: StageName[] = ['Parse', 'Normalize', 'Resize', 'Optimize', 'Export']
const STAGE_COLORS = [
  'var(--color-cyan)',
  'var(--color-blue)',
  'var(--color-violet)',
  'var(--color-pink)',
  'var(--color-amber)',
] as const
const STAGE_DURATION_MS = 100

function stageColor(index: number): string {
  return STAGE_COLORS[index] ?? STAGE_COLORS[4]
}

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
  phase,
  color,
  endColor,
  value,
}: {
  name: StageName
  phase: StagePhase
  color: string
  endColor: string
  value: string | null
}) {
  const Icon = STAGE_ICON[name]
  const highlighted = phase !== 'idle'
  const labelTone = phase === 'idle' ? 'text-dim' : 'text-muted'

  return (
    <li
      class="relative flex flex-1 basis-20 rounded-lg bg-line p-px transition-shadow duration-100 ease-signal"
      style={
        highlighted
          ? {
              boxShadow:
                phase === 'active'
                  ? `0 0 0 1px color-mix(in srgb, ${color} 40%, transparent)`
                  : 'none',
            }
          : undefined
      }
    >
      <span
        aria-hidden="true"
        class={`absolute inset-0 rounded-[inherit] transition-opacity duration-100 ease-signal ${highlighted ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: `linear-gradient(90deg, ${color}, ${endColor})` }}
      />
      <div class="relative flex w-full flex-col items-center justify-center gap-2 rounded-[calc(var(--radius-lg)-1px)] bg-bg px-1.5 py-3.5">
        <Icon class={`size-5 ${labelTone}`} aria-hidden />
        <span class={`text-xs font-bold tracking-[0.12em] uppercase ${labelTone}`}>{name}</span>
        {value !== null && (
          <span class="font-mono text-sm text-dim" style={highlighted ? { color } : undefined}>
            {value}
          </span>
        )}
      </div>
    </li>
  )
}

function Arrow({ reached, color }: { reached: boolean; color: string }) {
  return (
    <li
      aria-hidden="true"
      class="hidden shrink-0 items-center text-line-strong transition-colors duration-100 ease-signal sm:flex"
      style={reached ? { color } : undefined}
    >
      <ArrowRight class="size-3.5" />
    </li>
  )
}

export function PipelineStrip({ state, bundle }: Props) {
  const values = bundle === null ? null : report(bundle)
  const [activeStage, setActiveStage] = useState<number | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const actualDone = useRef(false)
  const sequenceComplete = useRef(false)

  useEffect(() => {
    if (state === 'working') {
      timers.current.forEach(clearTimeout)
      timers.current = []
      actualDone.current = false
      sequenceComplete.current = false

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setActiveStage(STAGES.length - 1)
        sequenceComplete.current = true
        return
      }

      setActiveStage(0)
      for (let index = 1; index < STAGES.length; index += 1) {
        timers.current.push(
          setTimeout(() => {
            setActiveStage(index)
          }, index * STAGE_DURATION_MS),
        )
      }
      timers.current.push(
        setTimeout(() => {
          sequenceComplete.current = true
          if (actualDone.current) {
            setActiveStage(null)
          }
        }, STAGES.length * STAGE_DURATION_MS),
      )
      return
    }

    if (state === 'done') {
      actualDone.current = true
      if (sequenceComplete.current) {
        setActiveStage(null)
      }
      return
    }

    timers.current.forEach(clearTimeout)
    timers.current = []
    setActiveStage(null)
  }, [state])

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout)
    },
    [],
  )

  const shownActiveStage = activeStage ?? (state === 'working' ? 0 : null)
  let progress = 0
  if (shownActiveStage !== null) {
    progress = (shownActiveStage + 1) / STAGES.length
  } else if (state === 'done') {
    progress = 1
  }

  return (
    <section
      class="flex h-full flex-col justify-center rounded-xl border border-line bg-surface p-4"
      aria-label="Pipeline"
    >
      <ol class="flex flex-wrap items-stretch gap-1.5">
        {STAGES.map((name, index) => (
          <Fragment key={name}>
            {index > 0 && (
              <Arrow
                reached={
                  state === 'done' || (shownActiveStage !== null && index <= shownActiveStage)
                }
                color={stageColor(index)}
              />
            )}
            <Stage
              name={name}
              phase={
                shownActiveStage === null
                  ? state === 'done'
                    ? 'done'
                    : 'idle'
                  : index === shownActiveStage
                    ? 'active'
                    : index < shownActiveStage
                      ? 'reached'
                      : 'idle'
              }
              color={stageColor(index)}
              endColor={stageColor(index + 1)}
              value={values?.[name] ?? null}
            />
          </Fragment>
        ))}
      </ol>

      <div class="mt-3 h-0.5 overflow-hidden rounded-full bg-line">
        <div
          class="h-full origin-left rounded-full transition-transform duration-100 ease-signal"
          style={{
            background: `linear-gradient(90deg, ${STAGE_COLORS.join(', ')})`,
            transform: `scaleX(${progress})`,
          }}
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
