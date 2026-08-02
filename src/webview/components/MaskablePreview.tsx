/**
 * The maskable preview: the mask a launcher may apply, over the bytes we actually wrote.
 *
 * Its own file because it is the only preview with state — a mask shape and a ring
 * toggle — and because it is the one that earns its keep. The Safe Zone is a *circle*,
 * and a square inset cannot express it: a mark painting into its bounding-box corners
 * escapes a 0.6-side box, whose half-diagonal is 0.424 against a safe radius of 0.4.
 * Drawn over the real PNG, that is visible rather than arithmetic.
 */

import { useState } from 'preact/hooks'

import { MASKS, Panel, pngUrl, SAFE_ZONE, SQUIRCLE_ID } from './preview-parts.tsx'
import type { Mask } from './preview-parts.tsx'
/**
 * Android maskable, with the mask the OS may apply and the Safe Zone it guarantees.
 *
 * The reason this preview is worth building first: the Safe Zone is a *circle*, and a
 * square inset cannot express it. A mark that paints into its own bounding-box corners
 * escapes a 0.6-side box because the half-diagonal is 0.424 against a safe radius of 0.4.
 * With the ring drawn over the real bytes, that is visible rather than arithmetic.
 */
export function AndroidMaskable({ png }: { png: string }) {
  const [mask, setMask] = useState<Mask>('circle')
  const [ring, setRing] = useState(true)

  const masked =
    mask === 'circle'
      ? { borderRadius: '50%' }
      : mask === 'rounded'
        ? { borderRadius: '20%' }
        : mask === 'squircle'
          ? { clipPath: `url(#${SQUIRCLE_ID})` }
          : {}

  return (
    <Panel
      title="Android maskable"
      note="icon-maskable-512.png. Android launchers crop this to their own shape, so anything outside the ring can be cut off."
    >
      <div class="flex items-start gap-4">
        <div class="relative size-32 shrink-0">
          <img
            src={pngUrl(png)}
            alt={`icon-maskable-512.png with the ${mask} launcher mask applied`}
            width={128}
            height={128}
            class="block size-full"
            style={masked}
          />
          {ring && (
            <div
              class="pointer-events-none absolute rounded-full border border-dashed border-accent"
              style={{
                inset: `${((1 - SAFE_ZONE) / 2) * 100}%`,
              }}
            />
          )}
        </div>

        <div class="space-y-1.5">
          {MASKS.map((shape) => (
            <label key={shape} class="flex items-center gap-2 text-[13px] capitalize">
              <input
                type="radio"
                name="mask"
                checked={mask === shape}
                class="accent-accent"
                onChange={() => {
                  setMask(shape)
                }}
              />
              {shape}
            </label>
          ))}
          <label class="mt-2 flex items-center gap-2 border-t border-line pt-2 text-[13px]">
            <input
              type="checkbox"
              checked={ring}
              class="accent-accent"
              onChange={(event) => {
                setRing(event.currentTarget.checked)
              }}
            />
            Safe Zone
          </label>
        </div>
      </div>
    </Panel>
  )
}
