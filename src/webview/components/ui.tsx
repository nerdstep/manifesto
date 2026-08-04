import type { ComponentChildren, JSX } from 'preact'

import { cn } from '../utils/index.ts'

/** Shared keyboard focus treatment. */
export const focusRing =
  'outline-none focus-visible:border-cyan focus-visible:ring-3 focus-visible:ring-cyan/30'

export type Tone = 'upstream' | 'settings' | 'downstream'

const sectionHeadingTone = {
  upstream: 'text-cyan',
  settings: 'text-pink',
  downstream: 'text-amber',
} satisfies Record<Tone, string>

type ButtonProps = JSX.IntrinsicElements['button']

/** Defaults to `button` to prevent accidental form submission. */
export function Button({ class: klass, className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      class={cn(
        'shrink-0 cursor-pointer rounded-lg border border-line bg-raised px-3 py-1.5 text-ink',
        'transition-colors duration-150 ease-signal hover:border-line-strong',
        focusRing,
        klass,
        className,
      )}
      {...rest}
    />
  )
}

type InputProps = JSX.IntrinsicElements['input']

export function Input({ class: klass, className, ...rest }: InputProps) {
  return (
    <input
      class={cn(
        'w-full rounded-lg border border-line bg-raised px-2.5 py-1.5 text-ink',
        'outline-none transition-colors duration-150 ease-signal focus:border-cyan h-8',
        klass,
        className,
      )}
      {...rest}
    />
  )
}

type PanelProps = JSX.IntrinsicElements['section']

export function Panel({ class: klass, className, ...rest }: PanelProps) {
  return (
    <section class={cn('rounded-xl border border-line bg-surface', klass, className)} {...rest} />
  )
}

export function SectionHeading({
  children,
  note,
  meta,
  tone = 'upstream',
}: {
  children: ComponentChildren
  note?: ComponentChildren
  meta?: ComponentChildren
  tone?: Tone
}) {
  return (
    <header class="mt-6 mb-2 flex items-end justify-between gap-3">
      <div class="min-w-0">
        <h2 class={cn('text-sm font-bold tracking-[0.14em] uppercase', sectionHeadingTone[tone])}>
          {children}
        </h2>
        {note !== undefined && <p class="mt-0.5 text-sm text-muted">{note}</p>}
      </div>
      {meta !== undefined && <div class="shrink-0 font-mono text-sm text-dim">{meta}</div>}
    </header>
  )
}

type PillProps = JSX.IntrinsicElements['button'] & { selected?: boolean }

export function Pill({ selected = false, class: klass, children, ...rest }: PillProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      class={cn(
        'cursor-pointer rounded-full border px-2.5 py-1 text-xs capitalize',
        'transition-colors duration-150 ease-signal',
        focusRing,
        selected
          ? 'border-cyan text-cyan'
          : 'border-line text-dim hover:border-line-strong hover:text-muted',
        klass,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Caption({
  class: klass,
  children,
  ...rest
}: JSX.IntrinsicElements['span'] & { children: ComponentChildren }) {
  return (
    <span class={cn('text-xs font-bold tracking-widest text-muted uppercase', klass)} {...rest}>
      {children}
    </span>
  )
}

export function Note({
  class: klass,
  children,
  ...rest
}: JSX.IntrinsicElements['p'] & { children: ComponentChildren }) {
  return (
    <p class={cn('text-sm text-muted', klass)} {...rest}>
      {children}
    </p>
  )
}
