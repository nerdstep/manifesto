import type { ComponentChildren, JSX } from 'preact'

import { cn } from '../utils/index.ts'

/** Shared keyboard focus treatment. */
export const focusRing =
  'outline-none focus-visible:border-cyan focus-visible:ring-3 focus-visible:ring-cyan/30'

export type Tone = 'upstream' | 'downstream'

type ButtonProps = JSX.IntrinsicElements['button']

/** Defaults to `button` to prevent accidental form submission. */
export function Button({ class: klass, className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      class={cn(
        'shrink-0 cursor-pointer rounded-lg border border-line bg-raised px-3 py-1.5 text-[13px] text-ink',
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
        'w-full rounded-lg border border-line bg-raised px-2.5 py-1.5 text-[13px] text-ink',
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

export function SectionLabel({
  tone = 'upstream',
  class: klass,
  children,
  ...rest
}: JSX.IntrinsicElements['h2'] & { tone?: Tone; children: ComponentChildren }) {
  return (
    <h2
      class={cn(
        'text-[11px] font-bold tracking-[0.14em] uppercase',
        tone === 'downstream' ? 'text-amber' : 'text-cyan',
        klass,
      )}
      {...rest}
    >
      {children}
    </h2>
  )
}

type PillProps = JSX.IntrinsicElements['button'] & { selected?: boolean }

export function Pill({ selected = false, class: klass, children, ...rest }: PillProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      class={cn(
        'cursor-pointer rounded-full border px-2.5 py-1 text-[10px] capitalize',
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
    <span class={cn('text-[10px] font-bold tracking-widest text-muted uppercase', klass)} {...rest}>
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
    <p class={cn('text-[11px] text-muted', klass)} {...rest}>
      {children}
    </p>
  )
}
