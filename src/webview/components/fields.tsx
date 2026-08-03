/**
 * The individual input controls the settings panel is built from.
 *
 * Two of them behave differently from a plain controlled input, and both differences are
 * deliberate:
 *
 * - **CommittedField** applies on blur or Enter, not on every keystroke. It names a
 *   folder, and renaming a folder per character would leave a trail of directories.
 * - **ColorField** keeps a local draft, because `#2E5` is a legal thing to have typed
 *   halfway to `#2E5BFF` and must not be committed or reformatted underneath the cursor.
 */

import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'

import type { Hex } from '../../pipeline/index.ts'
import { cn } from '../utils/index.ts'
import { Button, Caption, focusRing, Input, Note } from './ui.tsx'

export function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="block">
      <Caption class="mb-1.5 block">{label}</Caption>
      {children}
    </label>
  )
}

function isHex(value: string): value is Hex {
  return /^#[0-9a-f]{6}$/iu.test(value)
}

/**
 * A colour swatch and its hex, either of which edits the other.
 *
 * The swatch commits on `change`, not on `input`.
 *
 * On Windows the swatch opens a native modal picker, and Chromium fires `input`
 * continuously as the user moves around inside it — dozens of events before they have
 * decided anything. Regenerating on each one is visibly bouncy and writes a folder full
 * of files for every colour the pointer passes over. `change` fires when the dialog is
 * dismissed, which is exactly "the mouse is no longer down".
 *
 * `input` still runs, but only into the local draft, so the swatch and hex stay live
 * while the picker is open. The distinction is between *showing* a colour and
 * *committing* to it.
 */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: Hex
  onChange: (next: Hex) => void
}) {
  const [draft, setDraft] = useState<string>(value)

  // Follow the committed value when it changes from outside this field — a Sidecar
  // recall, or a fresh drop. Typing does not go through here, so the cursor is safe.
  useEffect(() => {
    setDraft(value)
  }, [value])

  const shown = isHex(draft) ? draft : value

  return (
    <fieldset class="min-w-0">
      <legend class="mb-1.5">
        <Caption>{label}</Caption>
      </legend>
      <div class="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={shown}
          class={cn(
            'h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-line bg-raised p-0.5',
            focusRing,
          )}
          onInput={(event) => {
            setDraft(event.currentTarget.value)
          }}
          onChange={(event) => {
            const next = event.currentTarget.value
            if (isHex(next)) onChange(next)
          }}
        />
        <Input
          type="text"
          aria-label={`${label} hex value`}
          value={draft}
          spellcheck={false}
          class="font-mono uppercase"
          // Typing is already discrete — each keystroke is a decision — so a valid hex
          // commits immediately. It is the dragging that needed holding back.
          onInput={(event) => {
            const next = event.currentTarget.value
            setDraft(next)
            if (isHex(next)) onChange(next)
          }}
          // Whatever half-typed text is left over is not a colour. Snap back rather than
          // leaving the field showing something the Bundle does not contain.
          onBlur={() => {
            setDraft(value)
          }}
        />
      </div>
    </fieldset>
  )
}

/** Text that is only applied once the user has finished with it. */
export function CommittedField({
  label,
  value,
  hint,
  onCommit,
}: {
  label: string
  value: string
  hint: string
  onCommit: (next: string) => void
}) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  return (
    <Field label={label}>
      <Input
        type="text"
        value={draft}
        spellcheck={false}
        class="font-mono"
        onInput={(event) => {
          setDraft(event.currentTarget.value)
        }}
        onBlur={() => {
          onCommit(draft)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') setDraft(value)
        }}
      />
      <Note class="mt-1">{hint}</Note>
    </Field>
  )
}

/**
 * The second mark, used wherever the Icon Background is dark.
 *
 * Behaves exactly like the source pane, and for the same reason: it is a drop target, so
 * without an activate-to-choose path it is pointer-only. It had neither that nor a hover
 * state, which also left it looking inert next to every other control on the panel.
 */
export function DarkMarkField({
  filename,
  onFile,
  onChoose,
  onClear,
}: {
  filename: string | null
  onFile: (file: File) => void
  onChoose: () => void
  onClear: () => void
}) {
  const [over, setOver] = useState(false)

  return (
    <fieldset class="min-w-0">
      <legend class="mb-1.5">
        <Caption>Dark-mode logo (optional)</Caption>
      </legend>
      <div class="flex items-stretch gap-2">
        <div
          role="button"
          tabIndex={0}
          aria-label={
            filename === null
              ? 'Drop a dark-mode SVG here, or activate to choose one'
              : `Dark-mode logo ${filename}. Activate to replace it.`
          }
          onDragOver={(event) => {
            event.preventDefault()
            setOver(true)
          }}
          onDragLeave={(event) => {
            if (event.relatedTarget === null) setOver(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setOver(false)
            const file = [...(event.dataTransfer?.files ?? [])].find((f) => /\.svg$/iu.test(f.name))
            if (file !== undefined) onFile(file)
          }}
          onClick={onChoose}
          onKeyDown={(event) => {
            // Space is prevented because its default is scrolling the page.
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onChoose()
            }
          }}
          class={cn(
            'flex min-w-0 flex-1 cursor-pointer items-center rounded-lg border border-dashed px-2.5 py-1.5 text-[13px] h-8',
            'transition-colors duration-150 ease-signal',
            focusRing,
            over ? 'border-cyan bg-cyan/8 text-ink' : 'border-line text-muted hover:border-cyan',
          )}
        >
          <span class="truncate font-mono text-xs">{filename ?? 'Drop or click to choose'}</span>
        </div>
        {filename !== null && (
          <Button
            class="text-xs text-muted hover:text-bad"
            // "Remove" alone is ambiguous once a screen reader reads it out of context.
            aria-label={`Remove the dark-mode logo, ${filename}`}
            onClick={onClear}
          >
            Remove
          </Button>
        )}
      </div>
      <Note class="mt-1">
        Used wherever the icon background is dark, and inside favicon.svg so browsers swap
        automatically.
      </Note>
    </fieldset>
  )
}
