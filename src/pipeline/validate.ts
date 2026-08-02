/**
 * Stage 2 — inspect the Source Mark, remove what must not ship, and report the rest.
 *
 * Parsing is done by SVGO's XML parser via a custom collector plugin, not by regex.
 * Script removal is a correctness-critical edit to a file we then write to the user's
 * web root, and regex XML parsing is the classic way to get that subtly wrong.
 *
 * Scope, settled in Phase 0:
 *
 * - `<script>` and `on*` handlers are STRIPPED, always, regardless of the optimize
 *   toggle. A `favicon.svg` opened directly in a browser executes its scripts.
 * - `<text>` raises an advisory. resvg renders text blank without font buffers. If text
 *   is ALL the mark contains, Normalization's empty-mark guard turns it into a hard
 *   error, which is correct — the advisory is for a mark that is part glyph, part text.
 * - Unresolvable `<image href>` raises an advisory and nothing more. resvg-wasm never
 *   resolves remote refs (spike 0.1 verified zero `fetch` calls with `fetch` trapped),
 *   and the alpha scan ignores unpainted geometry, so there is nothing to defend
 *   against and nothing to correct.
 */

import { _collections, optimize as runSvgo } from 'svgo/browser'
import type { CustomPlugin, XastElement } from 'svgo/browser'

import type { Advisory } from './types.ts'
import { InvalidSvgError } from './types.ts'

/** Text containers. `<tspan>` lives inside `<text>`, so counting it would double up. */
const TEXT_ELEMENTS = new Set(['text', 'textPath'])

/**
 * Every event-handler attribute, taken from SVGO's own collections rather than a
 * hand-written list — it is the same source `removeScripts` strips from, so detection
 * and removal can never drift apart.
 */
const EVENT_ATTRIBUTES = new Set<string>([
  ...(_collections.attrsGroups.animationEvent ?? []),
  ...(_collections.attrsGroups.documentEvent ?? []),
  ...(_collections.attrsGroups.documentElementEvent ?? []),
  ...(_collections.attrsGroups.globalEvent ?? []),
  ...(_collections.attrsGroups.graphicalEvent ?? []),
])

export type ValidationResult = {
  /** The mark with `<script>` elements and event handlers removed. */
  sanitized: string
  advisories: Advisory[]
}

type Findings = {
  textElements: number
  scriptElements: number
  eventAttributes: number
  unresolvableImages: string[]
}

/** Drop an XML namespace prefix: `svg:text` -> `text`. */
function localName(name: string): string {
  const colon = name.indexOf(':')
  return colon === -1 ? name : name.slice(colon + 1)
}

function inspect(element: XastElement, into: Findings): void {
  const name = localName(element.name)

  if (TEXT_ELEMENTS.has(name)) into.textElements += 1
  if (name === 'script') into.scriptElements += 1

  for (const attribute of Object.keys(element.attributes)) {
    if (EVENT_ATTRIBUTES.has(localName(attribute))) into.eventAttributes += 1
  }

  if (name === 'image') {
    const href = element.attributes.href ?? element.attributes['xlink:href']
    // Anything that isn't inline data is unresolvable here — not just remote URLs.
    // A relative path has no base to resolve against either.
    if (href !== undefined && href !== '' && !href.startsWith('data:')) {
      into.unresolvableImages.push(href)
    }
  }
}

/** Records what the document contains. Must run before `removeScripts` edits it. */
function collector(into: Findings): CustomPlugin {
  return {
    name: 'manifesto-collect',
    fn: () => ({
      element: {
        enter: (node) => {
          inspect(node, into)
        },
      },
    }),
  }
}

export function validate(svg: string): ValidationResult {
  const findings: Findings = {
    textElements: 0,
    scriptElements: 0,
    eventAttributes: 0,
    unresolvableImages: [],
  }

  let stripped: string
  try {
    stripped = runSvgo(svg, {
      plugins: [collector(findings), 'removeScripts'],
      js2svg: { pretty: false },
    }).data
  } catch (cause) {
    throw new InvalidSvgError(`This file could not be parsed as SVG: ${String(cause)}`, {
      cause,
    })
  }

  const removed = findings.scriptElements + findings.eventAttributes

  // Only hand back SVGO's re-serialized output if something actually had to go.
  // Otherwise the Source Mark passes through byte-for-byte, so a user who turned
  // optimization off gets exactly the file they dropped.
  const sanitized = removed > 0 ? stripped : svg

  const advisories: Advisory[] = []

  if (removed > 0) {
    advisories.push({
      kind: 'scripts-removed',
      elements: findings.scriptElements,
      attributes: findings.eventAttributes,
    })
  }

  if (findings.textElements > 0) {
    advisories.push({ kind: 'text-elements', count: findings.textElements })
  }

  if (findings.unresolvableImages.length > 0) {
    advisories.push({ kind: 'external-image', hrefs: findings.unresolvableImages })
  }

  return { sanitized, advisories }
}
