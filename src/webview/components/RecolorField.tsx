import type { ColorPair, Scheme } from '../../pipeline/index.ts'
import { ColorField } from './fields.tsx'
import { Caption, Note, Pill } from './ui.tsx'

/**
 * Recolor for a one-color logo. Two colors, swapped between light and dark.
 * Only rendered when the host says this logo qualifies.
 */
export function RecolorField({
  seed,
  pair,
  primary,
  onChange,
}: {
  seed: ColorPair
  pair: ColorPair | null
  primary: Scheme
  onChange: (pair: ColorPair | null, primary: Scheme) => void
}) {
  const on = pair !== null
  const current = pair ?? seed

  return (
    <fieldset class="min-w-0 sm:col-span-2">
      <legend class="mb-1.5">
        <Caption>Two-color icons</Caption>
      </legend>

      <label class="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={on}
          class="size-4 accent-cyan"
          onChange={(event) => {
            onChange(event.currentTarget.checked ? current : null, primary)
          }}
        />
        <span>Recolor this logo</span>
      </label>
      <Note class="mt-1">
        {on
          ? 'Light mode swaps these two colors.'
          : 'Paints your one-color logo for light and dark.'}
      </Note>

      {on && (
        <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ColorField
            label="Dark mode logo color"
            value={current.mark}
            onChange={(mark) => {
              onChange({ ...current, mark }, primary)
            }}
          />
          <ColorField
            label="Dark mode background"
            value={current.surface}
            onChange={(surface) => {
              onChange({ ...current, surface }, primary)
            }}
          />
          <div class="sm:col-span-2">
            <Caption class="mb-1.5 block">PNG and ICO files use</Caption>
            <div class="flex gap-2">
              {(['light', 'dark'] as const).map((scheme) => (
                <Pill
                  key={scheme}
                  selected={primary === scheme}
                  onClick={() => {
                    onChange(current, scheme)
                  }}
                >
                  {scheme}
                </Pill>
              ))}
            </div>
            <Note class="mt-1">
              These files use one mode and lose their transparency. Only favicon.svg changes with
              the visitor's dark mode.
            </Note>
          </div>
        </div>
      )}
    </fieldset>
  )
}
