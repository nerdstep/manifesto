/**
 * Shared furniture for the context previews.
 *
 * Split out when the panels outgrew one file. Everything here is either a primitive the
 * panels draw with, or a constant defined exactly once because something elsewhere in the
 * codebase has to agree with it.
 */

import type { ComponentChildren } from 'preact'

import { FAVICON_DARK_CLASS, FAVICON_LIGHT_CLASS } from '../../shared/bundle.ts'

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

/** Text colour that stays readable on a user-chosen background. */
export function contrastInk(onDark: boolean): string {
  return onDark ? '#ffffff' : '#1c1917'
}

export function Panel({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children: ComponentChildren
}) {
  return (
    <div class="rounded-xl border border-line bg-panel p-3.5">
      <h3 class="mb-3 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{title}</h3>
      {children}
      <p class="mt-3 text-[11px] text-muted">{note}</p>
    </div>
  )
}
