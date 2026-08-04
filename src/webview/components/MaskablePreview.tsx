import { useState } from 'preact/hooks'

import { MASKS, pngUrl, SAFE_ZONE, SQUIRCLE_ID, Tile } from './preview-parts.tsx'
import type { Mask } from './preview-parts.tsx'
import { Pill } from './ui.tsx'

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
        <div class="absolute inset-0 overflow-hidden" style={MASK_STYLE[mask]}>
          <img
            src={pngUrl(png)}
            alt={`icon-maskable-512.png with the ${mask} launcher mask applied`}
            width={128}
            height={128}
            class="block size-full"
          />
          {ring && <div class="safe-zone-scrim pointer-events-none absolute inset-0" />}
        </div>

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
