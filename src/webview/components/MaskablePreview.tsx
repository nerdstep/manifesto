/**
 * The maskable preview: the mask a launcher may apply, over the bytes we actually wrote.
 *
 * Its own file because it is the only preview with state — a mask shape and a ring
 * toggle — and because it is the one that earns its keep. The Safe Zone is a *circle*,
 * and a square inset cannot express it: a mark painting into its bounding-box corners
 * escapes a 0.6-side box, whose half-diagonal is 0.424 against a safe radius of 0.4.
 * Drawn over the real PNG, that is visible rather than arithmetic.
 *
 * The controls sit **below** the icon, not beside it. Beside it they competed with a 128px
 * artefact for the tile's width, so the icon drifted off centre as the grid reflowed and
 * the tile ran taller than its neighbours at every column count.
 */

import { useState } from 'preact/hooks'

import { MASKS, pngUrl, SAFE_ZONE, SQUIRCLE_ID, Tile } from './preview-parts.tsx'
import type { Mask } from './preview-parts.tsx'
import { Pill } from './ui.tsx'

/** How each launcher shape is drawn. `none` is the unmasked truth. */
const MASK_STYLE: Record<Mask, Record<string, string>> = {
  circle: { borderRadius: '50%' },
  rounded: { borderRadius: '20%' },
  squircle: { clipPath: `url(#${SQUIRCLE_ID})` },
  none: {},
}

export function AndroidMaskable({ png }: { png: string }) {
  const [mask, setMask] = useState<Mask>('circle')
  const [ring, setRing] = useState(true)

  return (
    <Tile
      title="Android maskable"
      dimensions="512×512"
      note="Android launchers crop icon-maskable-512.png to different shapes. Anything outside the ring may be cut off."
      controls={
        // Two rows, not one wrapping row. Four mask pills need about 240px and the tile is
        // 265px wide at four columns, so a single row would wrap unpredictably as the grid
        // reflows — and a wrapped `ml-auto` puts the Safe Zone toggle somewhere different
        // at every width. Stacking makes the position fixed.
        <div class="flex flex-col gap-1.5">
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Launcher mask shape">
            {MASKS.map((shape) => (
              <Pill
                key={shape}
                selected={mask === shape}
                onClick={() => {
                  setMask(shape)
                }}
              >
                {shape}
              </Pill>
            ))}
          </div>

          {/*
            Kept out of the mask row on purpose. The mask is *what a launcher does to your
            icon*; the ring is *an overlay we draw on top*. One is simulation, the other is
            measurement, and putting them in one group would imply a fifth mask shape.
          */}
          <Pill
            class="self-start"
            selected={ring}
            aria-label="Show the Safe Zone ring"
            onClick={() => {
              setRing(!ring)
            }}
          >
            Safe Zone
          </Pill>
        </div>
      }
    >
      <div class="relative size-32">
        {/*
          The launcher mask clips the icon *and* the scrim together, so dimming never
          spills onto the Ground outside the masked shape.
        */}
        <div class="absolute inset-0 overflow-hidden" style={MASK_STYLE[mask]}>
          <img
            src={pngUrl(png)}
            alt={`icon-maskable-512.png with the ${mask} launcher mask applied`}
            width={128}
            height={128}
            class="block size-full"
          />
          {/* Dims what a launcher may crop. See `.safe-zone-scrim` for why it is not a ring. */}
          {ring && <div class="safe-zone-scrim pointer-events-none absolute inset-0" />}
        </div>

        {/*
          A hairline on the boundary the scrim already draws. It is not carrying the
          contrast — the luminance step does that — so 1px of cyan is enough to mark the
          edge as Manifesto's measurement rather than something in the artwork.
        */}
        {ring && (
          <div
            class="pointer-events-none absolute rounded-full border border-cyan/80"
            style={{ inset: `${((1 - SAFE_ZONE) / 2) * 100}%` }}
          />
        )}
      </div>
    </Tile>
  )
}
