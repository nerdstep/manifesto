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

/** Keep picker input local until the native color dialog commits its final value. */
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

  // Sync values loaded from a Sidecar or a new source file.
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
            if (isHex(next)) {
              onChange(next)
            }
          }}
        />
        <Input
          type="text"
          aria-label={`${label} hex value`}
          value={draft}
          spellcheck={false}
          class="font-mono uppercase"
          // Commit complete hex values without reformatting partial input.
          onInput={(event) => {
            const next = event.currentTarget.value
            setDraft(next)
            if (isHex(next)) {
              onChange(next)
            }
          }}
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
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            setDraft(value)
          }
        }}
      />
      <Note class="mt-1">{hint}</Note>
    </Field>
  )
}

/** Keyboard-accessible drop target for the optional dark-mode logo. */
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
            if (event.relatedTarget === null) {
              setOver(false)
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            setOver(false)
            const file = [...(event.dataTransfer?.files ?? [])].find((f) => /\.svg$/iu.test(f.name))
            if (file !== undefined) {
              onFile(file)
            }
          }}
          onClick={onChoose}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onChoose()
            }
          }}
          class={cn(
            'flex min-w-0 flex-1 cursor-pointer items-center rounded-lg border border-dashed px-2.5 py-1.5 h-8',
            'transition-colors duration-150 ease-signal',
            focusRing,
            over ? 'border-cyan bg-cyan/8 text-ink' : 'border-line text-muted hover:border-cyan',
          )}
        >
          <span class="text-code truncate font-mono">{filename ?? 'Drop or click to choose'}</span>
        </div>
        {filename !== null && (
          <Button
            class="text-muted hover:text-bad"
            aria-label={`Remove the dark-mode logo, ${filename}`}
            onClick={onClear}
          >
            Remove
          </Button>
        )}
      </div>
      <Note class="mt-1">
        Used on dark icon backgrounds and in favicon.svg when the browser uses dark mode.
      </Note>
    </fieldset>
  )
}
