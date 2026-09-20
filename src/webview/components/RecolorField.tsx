import type { ColorPair, Hex, RenderSettings, Scheme } from '../../pipeline/index.ts'
import { ColorField } from './fields.tsx'
import { Caption, focusRing, Note, Pill } from './ui.tsx'

const SCHEME_LABEL: Record<Scheme, string> = { light: 'Light', dark: 'Dark' }

/**
 * Recolor for a one-color logo. Two colors, swapped between light and dark.
 * Only rendered when the host says this logo qualifies.
 *
 * A Color Pair names its members for the dark scheme — mark on surface — and
 * light is the swap. The rasters and every preview show the Primary Scheme, so
 * the fields are labeled and wired for that scheme instead: editing "logo
 * color" always changes the color of the logo you are looking at.
 */
export function RecolorField({
  seed,
  pair,
  primary,
  enabled,
  rounded,
  onChange,
}: {
  seed: ColorPair
  pair: ColorPair | null
  primary: Scheme
  enabled: boolean
  rounded: boolean
  onChange: (change: Partial<RenderSettings>) => void
}) {
  const on = enabled
  const current = pair ?? seed
  const other: Scheme = primary === 'dark' ? 'light' : 'dark'

  // Dark paints the mark in `mark` on `surface`; light is the swap.
  const ink = primary === 'dark' ? current.mark : current.surface
  const surface = primary === 'dark' ? current.surface : current.mark
  const withInk = (value: Hex): ColorPair =>
    primary === 'dark' ? { ...current, mark: value } : { ...current, surface: value }
  const withSurface = (value: Hex): ColorPair =>
    primary === 'dark' ? { ...current, surface: value } : { ...current, mark: value }

  return (
    <fieldset class="min-w-0 sm:col-span-2">
      <legend class="mb-1.5">
        <Caption>Two-color icons</Caption>
      </legend>

      <label class="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={on}
          class={`size-4 accent-cyan ${focusRing}`}
          onChange={(event) => {
            onChange({ colorPair: current, recolorEnabled: event.currentTarget.checked })
          }}
        />
        <span>Recolor this logo</span>
      </label>
      <Note class="mt-1">
        {on
          ? `${SCHEME_LABEL[other]} mode swaps these two colors.`
          : 'Paints your one-color logo for light and dark.'}
      </Note>

      {on && (
        <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ColorField
            label={`${SCHEME_LABEL[primary]} mode logo color`}
            value={ink}
            onChange={(value) => {
              onChange({ colorPair: withInk(value) })
            }}
          />
          <ColorField
            label={`${SCHEME_LABEL[primary]} mode background`}
            value={surface}
            onChange={(value) => {
              onChange({ colorPair: withSurface(value) })
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
                    onChange({ primaryScheme: scheme })
                  }}
                >
                  {scheme}
                </Pill>
              ))}
            </div>
            <Note class="mt-1">
              These files use one mode with a solid background. Only favicon.svg changes with the
              visitor's dark mode.
            </Note>
          </div>
          <div class="sm:col-span-2">
            <label class="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={rounded}
                class={`size-4 accent-cyan ${focusRing}`}
                onChange={(event) => {
                  onChange({ roundedCorners: event.currentTarget.checked })
                }}
              />
              <span>Rounded corners</span>
            </label>
            <Note class="mt-1">
              Gives favicons and ordinary PNGs a squircle shape with transparent corners. Apple and
              Android apply their own shapes to home-screen icons.
            </Note>
          </div>
        </div>
      )}
    </fieldset>
  )
}
