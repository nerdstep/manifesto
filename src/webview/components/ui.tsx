/**
 * The primitives DESIGN.md names as components.
 *
 * These were class-name constants until they weren't reusable enough. A `const BUTTON`
 * string forces every caller to remember to spell `<button type="button" class={BUTTON}>`,
 * and there is nowhere to put the behaviour that always goes with the look — the default
 * `type`, the focus ring, the tone switch. A component owns both.
 *
 * Every one of them forwards `class` through `cn`, so a caller can override a single
 * utility (`<Button class="ml-auto">`) without fighting the base styles: `tailwind-merge`
 * resolves the conflict rather than letting declaration order decide it.
 *
 * Read DESIGN.md before changing any of these — several encode a named rule:
 *
 * - Borders are 1px everywhere except the source pane's 2px dashed.
 * - Focus is a cyan ring on `focus-visible` only, so keyboard users get it and mouse
 *   users see nothing change. See The Glow-Is-State Rule.
 * - Radii are 8px for controls and 12px for cards. Nothing rounder.
 */

import type { ComponentChildren, JSX } from 'preact'

import { cn } from '../utils/index.ts'

/**
 * Cyan ring, keyboard only.
 *
 * Exported because two things that are not `Button` need it — the source pane and the
 * colour swatch — and a second spelling of the focus treatment would be a second focus
 * treatment.
 */
export const focusRing =
  'outline-none focus-visible:border-cyan focus-visible:ring-3 focus-visible:ring-cyan/30'

/** Which half of the Signal Path a label belongs to. Cyan upstream, amber downstream. */
export type Tone = 'upstream' | 'downstream'

type ButtonProps = JSX.IntrinsicElements['button']

/**
 * The one button style. No primary/secondary split — no screen has competing actions.
 *
 * Defaults to `type="button"`: inside a form, the HTML default is `submit`, and this app
 * has no form to submit.
 */
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

/** Raised background, so it reads as somewhere a cursor goes. Focus shifts the border. */
export function Input({ class: klass, className, ...rest }: InputProps) {
  return (
    <input
      class={cn(
        'w-full rounded-lg border border-line bg-raised px-2.5 py-1.5 text-[13px] text-ink',
        'outline-none transition-colors duration-150 ease-signal focus:border-cyan',
        klass,
        className,
      )}
      {...rest}
    />
  )
}

type PanelProps = JSX.IntrinsicElements['section']

/** A Surface card. The only container shape in the system, and never nested. */
export function Panel({ class: klass, className, ...rest }: PanelProps) {
  return (
    <section class={cn('rounded-xl border border-line bg-surface', klass, className)} {...rest} />
  )
}

/**
 * A section heading, coloured by which half of the app it introduces.
 *
 * The tone is the point: with no shadows and one type size above 13px, the heading colour
 * is what tells you whether you are looking at inputs or at output.
 */
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

/**
 * A compact toggle in a set of mutually exclusive options.
 *
 * Selection is carried by `aria-pressed`, not by colour alone — the cyan is the visible
 * half of the state, and a screen reader gets the other half. Sized to sit in a row
 * beneath a preview without competing with it.
 */
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

/** Field labels and specimen captions. Uppercase micro-type, uniform by rule. */
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

/** The explanatory line under a label, a field, or a preview. */
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
