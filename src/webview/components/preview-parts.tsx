import type { ComponentChildren } from 'preact'

import { FAVICON_DARK_CLASS, FAVICON_LIGHT_CLASS } from '../../shared/bundle.ts'
import { contrastRatio } from '../../shared/color.ts'

export const MASKS = ['circle', 'squircle', 'rounded', 'none'] as const
export type Mask = (typeof MASKS)[number]

/** Mirrors the pipeline value without importing pipeline code into the webview. */
export const SAFE_ZONE = 0.8

/** CSS path coordinates use pixels, so the normalized squircle uses an SVG clip path. */
const SQUIRCLE = 'M.5,0 C.1,0 0,.1 0,.5 C0,.9 .1,1 .5,1 C.9,1 1,.9 1,.5 C1,.1 .9,0 .5,0 Z'
export const SQUIRCLE_ID = 'mfo-squircle'

export function SquircleClipPath() {
  return (
    <svg width="0" height="0" class="absolute" aria-hidden="true">
      <defs>
        <clipPath id={SQUIRCLE_ID} clipPathUnits="objectBoundingBox">
          <path d={SQUIRCLE} />
        </clipPath>
      </defs>
    </svg>
  )
}

function forceFaviconMode(svg: string, dark: boolean): string {
  const visible = dark ? FAVICON_DARK_CLASS : FAVICON_LIGHT_CLASS
  const hidden = dark ? FAVICON_LIGHT_CLASS : FAVICON_DARK_CLASS
  const override = `<style>.${hidden}{display:none!important}.${visible}{display:inline!important}</style>`
  return svg.replace(/<\/svg>\s*$/iu, `${override}</svg>`)
}

/** Keep generated SVG in a static image document outside the application DOM. */
export function svgUrl(svg: string, dark = false): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(forceFaviconMode(svg, dark))}`
}

export function pngUrl(base64: string): string {
  return `data:image/png;base64,${base64}`
}

export function decodeUtf8(base64: string): string {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (character) => character.codePointAt(0) ?? 0)
  return new TextDecoder().decode(bytes)
}

export function contrastInk(background: string): string {
  const light = '#ffffff'
  const dark = '#000000'

  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark
}

export function Tile({
  title,
  dimensions,
  note,
  controls,
  children,
}: {
  title: string
  dimensions: string
  note: string
  controls?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <figure class="m-0 flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5 transition-colors duration-150 ease-signal hover:border-line-strong">
      <div class="grid min-h-33 place-items-center rounded-lg bg-bg p-3.5">{children}</div>
      {controls}
      <figcaption class="flex items-baseline justify-between gap-2">
        <span class="text-[10px] font-bold tracking-widest text-muted uppercase">{title}</span>
        <span class="shrink-0 font-mono text-[10px] text-dim">{dimensions}</span>
      </figcaption>
      <p class="text-[11px] text-dim">{note}</p>
    </figure>
  )
}
