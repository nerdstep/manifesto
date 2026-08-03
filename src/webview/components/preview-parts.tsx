/**
 * Shared furniture for the context previews.
 *
 * Split out when the panels outgrew one file. Everything here is either a primitive the
 * panels draw with, or a constant defined exactly once because something elsewhere in the
 * codebase has to agree with it.
 */

import type { ComponentChildren } from 'preact'

import { FAVICON_DARK_CLASS, FAVICON_LIGHT_CLASS } from '../../shared/bundle.ts'
import { contrastRatio } from '../../shared/color.ts'

/** Android's launcher mask shapes, plus the unmasked truth. */
export const MASKS = ['circle', 'squircle', 'rounded', 'none'] as const
export type Mask = (typeof MASKS)[number]

/**
 * The centred circle a maskable icon is guaranteed to keep, as a fraction of width.
 *
 * Mirrors `SAFE_ZONE_DIAMETER` in the pipeline. Duplicated rather than imported because a
 * value import from the pipeline pulls `svgo` and `node:crypto` into the browser bundle —
 * the 1.88 MB failure. `test/webview-purity.test.ts` asserts the two are equal, because a
 * ring drawn at the wrong diameter is worse than no ring: it would certify marks that
 * actually get clipped.
 */
export const SAFE_ZONE = 0.8

/**
 * Superellipse approximating Android's squircle mask.
 *
 * Lives in an SVG `<clipPath clipPathUnits="objectBoundingBox">` rather than a CSS
 * `clip-path: path()`, because `path()` takes user units — the same coordinates would
 * clip the image to a one-pixel shape.
 */
const SQUIRCLE = 'M.5,0 C.1,0 0,.1 0,.5 C0,.9 .1,1 .5,1 C.9,1 1,.9 1,.5 C1,.1 .9,0 .5,0 Z'
export const SQUIRCLE_ID = 'mfo-squircle'

/** The squircle mask, once, in normalized coordinates. */
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

/**
 * Forces one half of a dual-mode `favicon.svg` to show.
 *
 * Rendered from the shared class-name constants rather than written into `app.css`, so
 * there is one definition of these names in the codebase. Tailwind could not generate
 * these rules anyway: the class names come from a generated file, not from any component
 * its `@source` scan can see.
 *
 * Two class selectors beat the single-class rules inside the SVG, in either media state —
 * which is what makes the dark mock show the Dark Mark on a light-themed machine.
 */
export const TAB_CSS = [
  `.tab-light .${FAVICON_DARK_CLASS}{display:none}`,
  `.tab-light .${FAVICON_LIGHT_CLASS}{display:inline}`,
  `.tab-dark .${FAVICON_LIGHT_CLASS}{display:none}`,
  `.tab-dark .${FAVICON_DARK_CLASS}{display:inline}`,
].join('')

export function pngUrl(base64: string): string {
  return `data:image/png;base64,${base64}`
}

/** base64 → text, for the one file rendered as markup rather than as an image. */
export function decodeUtf8(base64: string): string {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (character) => character.codePointAt(0) ?? 0)
  return new TextDecoder().decode(bytes)
}

/** Text colour that maximizes contrast on a user-chosen background. */
export function contrastInk(background: string): string {
  const light = '#ffffff'
  const dark = '#000000'

  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark
}

/**
 * One output tile: a Ground-coloured well holding the platform mock at true size, under a
 * specimen caption.
 *
 * The caption is the name and the exact dimensions, in that order, with the dimension in
 * monospace because it is a fact about the file. See The Specimen Caption Rule — this is a
 * caption on an artefact, not a section heading, which is why 10px uppercase is right here
 * and would be an affectation above a paragraph.
 *
 * The caption sits *below* the well so the eye reaches the artefact first. The tiles are a
 * contact sheet; the labels are what you read second.
 */
export function Tile({
  title,
  dimensions,
  note,
  controls,
  children,
}: {
  title: string
  /** e.g. `16×16`. Rendered monospace beside the name. */
  dimensions: string
  note: string
  /**
   * Optional controls that change what the well is showing — the launcher-mask picker is
   * the only one.
   *
   * A slot rather than something the caller puts inside `children`, because the well is
   * for the artefact and nothing else. Controls sitting on the specimen surface read as
   * part of the specimen. They also go *below* it: beside it, they compete with the icon
   * for the tile's width and force the artefact off centre at every column width.
   */
  controls?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <figure class="m-0 flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5 transition-colors duration-150 ease-signal hover:border-line-strong">
      <div class="grid min-h-33 place-items-center rounded-lg bg-bg p-3.5">{children}</div>
      {/* No layout imposed — the tile owns the slot's position, the caller owns its shape. */}
      {controls}
      <figcaption class="flex items-baseline justify-between gap-2">
        <span class="text-[10px] font-bold tracking-widest text-muted uppercase">{title}</span>
        <span class="shrink-0 font-mono text-[10px] text-dim">{dimensions}</span>
      </figcaption>
      <p class="text-[11px] text-dim">{note}</p>
    </figure>
  )
}
