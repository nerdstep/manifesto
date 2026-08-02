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
export const INPUT =
  'w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[13px] text-ink ' +
  'outline-none focus:border-accent'

const LABEL = 'mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-muted uppercase'

export function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="block">
      <span class={LABEL}>{label}</span>
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
    <Field label={label}>
      <div class="flex items-center gap-2">
        <input
          type="color"
          value={shown}
          class="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-line bg-panel p-0.5"
          onInput={(event) => {
            setDraft(event.currentTarget.value)
          }}
          onChange={(event) => {
            const next = event.currentTarget.value
            if (isHex(next)) onChange(next)
          }}
        />
        <input
          type="text"
          value={draft}
          spellcheck={false}
          class={`${INPUT} font-mono uppercase`}
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
    </Field>
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
      <input
        type="text"
        value={draft}
        spellcheck={false}
        class={`${INPUT} font-mono`}
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
      <small class="mt-1 block text-[11px] text-muted">{hint}</small>
    </Field>
  )
}

/** The second mark, used wherever the Icon Background is dark. */
export function DarkMarkField({
  filename,
  onFile,
  onClear,
}: {
  filename: string | null
  onFile: (file: File) => void
  onClear: () => void
}) {
  const [over, setOver] = useState(false)

  return (
    <Field label="Dark-mode logo (optional)">
      <div
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
        class={[
          'flex items-center justify-between gap-2 rounded-lg border border-dashed px-2.5 py-1.5 text-[13px]',
          over ? 'border-accent bg-accent/8 text-ink' : 'border-line text-muted',
        ].join(' ')}
      >
        <span class="truncate font-mono text-xs">{filename ?? 'Drop a second SVG'}</span>
        {filename !== null && (
          <button
            type="button"
            class="shrink-0 text-xs text-muted hover:text-bad"
            // "Remove" alone is ambiguous once a screen reader reads it out of context.
            aria-label={`Remove the dark-mode logo, ${filename}`}
            onClick={onClear}
          >
            Remove
          </button>
        )}
      </div>
      <small class="mt-1 block text-[11px] text-muted">
        Used wherever the icon background is dark, and inside favicon.svg so browsers swap
        automatically.
      </small>
    </Field>
  )
}
