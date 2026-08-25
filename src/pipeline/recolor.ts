/** Detect a Source Mark's single paint color and rewrite it (ADR 0003). */

import { _collections, optimize as runSvgo } from 'svgo/browser'
import type { CustomPlugin, XastElement } from 'svgo/browser'

import type { Hex } from './types.ts'
import { InvalidSvgError } from './types.ts'

/** Properties that carry a paint value, as attributes or as style declarations. */
const PAINT_PROPERTIES = ['fill', 'stroke', 'stop-color'] as const

/** Elements that paint themselves, and so inherit SVG's black `fill` default. */
const PAINTED_ELEMENTS = new Set([
  'circle',
  'ellipse',
  'line',
  'path',
  'polygon',
  'polyline',
  'rect',
  'text',
  'textPath',
  'tspan',
  'use',
])

/** SVG's initial `fill` when no ancestor declares one. */
const IMPLICIT_FILL: Hex = '#000000'

const HEX_SHORTHAND = /^#[\da-f]{3}$/iu
const HEX_FULL = /^#[\da-f]{6}$/iu
const RGB_FUNCTION = /^rgba?\(([^)]*)\)$/iu

const RGB_CHANNELS = 3
const HEX_RADIX = 16
const HEX_PAIR = 2

function localName(name: string): string {
  const colon = name.indexOf(':')
  return colon === -1 ? name : name.slice(colon + 1)
}

function pad(value: number): string {
  return value.toString(HEX_RADIX).padStart(HEX_PAIR, '0')
}

/**
 * Normalize a paint value so `#111`, `#111111`, `rgb(17,17,17)` and a named
 * color all compare equal. Returns null for anything that is not a flat
 * color — `currentColor`, `url(#gradient)`, `inherit` — which disqualifies
 * the mark from recolor rather than being rewritten blindly.
 */
export function toHex(value: string): Hex | null {
  const paint = value.trim().toLowerCase()

  if (HEX_FULL.test(paint)) {
    return `#${paint.slice(1)}`
  }
  if (HEX_SHORTHAND.test(paint)) {
    return `#${paint.slice(1).replaceAll(/(.)/gu, '$1$1')}`
  }

  const names: Record<string, string> = _collections.colorsNames
  const named = names[paint]
  if (named !== undefined) {
    return toHex(named)
  }

  const rgb = RGB_FUNCTION.exec(paint)
  if (rgb === null) {
    return null
  }
  const channels = (rgb[1] ?? '').split(/[\s,/]+/u).filter((part) => part !== '')
  if (channels.length !== RGB_CHANNELS) {
    return null
  }
  const values = channels.map(Number)
  if (values.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    return null
  }
  return `#${values.map((channel) => pad(channel)).join('')}`
}

type Declarations = { property: string; value: string }[]

function parseStyle(style: string): Declarations {
  return style
    .split(';')
    .map((declaration) => declaration.split(':'))
    .filter((parts) => parts.length >= HEX_PAIR)
    .map(([property, ...rest]) => ({
      property: (property ?? '').trim().toLowerCase(),
      value: rest.join(':').trim(),
    }))
}

function paintsOf(element: XastElement): { property: string; value: string }[] {
  const declared = parseStyle(element.attributes.style ?? '').filter((declaration) =>
    (PAINT_PROPERTIES as readonly string[]).includes(declaration.property),
  )

  const attributes = PAINT_PROPERTIES.flatMap((property) => {
    const value = element.attributes[property]
    return value === undefined ? [] : [{ property, value }]
  })

  return [...attributes, ...declared]
}

/** A `<style>` element can repaint anything; its rules are out of our reach. */
function hasStylesheet(element: XastElement): boolean {
  return localName(element.name) === 'style'
}

/**
 * Visit every element with the `fill` it inherits, so an element relying on
 * SVG's black default is told apart from one inside a `fill="none"` group.
 */
function walk(svg: string, visit: (element: XastElement, inheritedFill: string) => void): string {
  const inherited: string[] = [IMPLICIT_FILL]

  const plugin: CustomPlugin = {
    name: 'manifesto-recolor',
    fn: () => ({
      element: {
        enter: (node) => {
          const own = paintsOf(node).find((declaration) => declaration.property === 'fill')
          inherited.push(own?.value ?? inherited.at(-1) ?? IMPLICIT_FILL)
          visit(node, inherited.at(-1) ?? IMPLICIT_FILL)
        },
        exit: () => {
          inherited.pop()
        },
      },
    }),
  }

  try {
    return runSvgo(svg, { plugins: [plugin], js2svg: { pretty: false } }).data
  } catch (cause) {
    throw new InvalidSvgError(`This file could not be parsed as SVG: ${String(cause)}`, { cause })
  }
}

/**
 * The one color every painted element uses, or null when the mark is not
 * eligible for recolor: no paint at all, more than one color, a stylesheet,
 * or a paint value that is not a flat color.
 */
export function monochromePaint(svg: string): Hex | null {
  const colors = new Set<Hex>()
  let disqualified = false

  const inspect = (element: XastElement, inheritedFill: string): void => {
    if (hasStylesheet(element)) {
      disqualified = true
      return
    }

    // A painted element with no fill anywhere above it is black.
    if (PAINTED_ELEMENTS.has(localName(element.name)) && !declaresFill(element)) {
      const hex = toHex(inheritedFill)
      if (hex !== null) {
        colors.add(hex)
      }
    }

    for (const { value } of paintsOf(element)) {
      if (value.trim().toLowerCase() === 'none') {
        continue
      }
      const hex = toHex(value)
      if (hex === null) {
        disqualified = true
        return
      }
      colors.add(hex)
    }
  }

  // Eligibility is a question, not a validation: an unparseable file is simply
  // not monochrome, and `validate` reports the real problem later.
  try {
    walk(svg, inspect)
  } catch {
    return null
  }

  if (disqualified || colors.size !== 1) {
    return null
  }
  return [...colors][0] ?? null
}

/**
 * Repaint every paint value, and give painted elements that rely on SVG's
 * black default an explicit fill — an element inheriting the default is still
 * part of the mark, and leaving it black is the failure recolor exists to fix.
 */
export function recolor(svg: string, color: Hex): string {
  return walk(svg, (element, inheritedFill) => {
    for (const property of PAINT_PROPERTIES) {
      if (element.attributes[property] !== undefined) {
        element.attributes[property] = repaint(element.attributes[property], color)
      }
    }

    const style = element.attributes.style
    if (style !== undefined) {
      element.attributes.style = repaintStyle(style, color)
    }

    // Only where the inherited fill is a color: a `fill="none"` ancestor
    // deliberately paints nothing, and recolor must not undo that.
    if (
      PAINTED_ELEMENTS.has(localName(element.name)) &&
      !declaresFill(element) &&
      toHex(inheritedFill) !== null
    ) {
      element.attributes.fill = color
    }
  })
}

function declaresFill(element: XastElement): boolean {
  return paintsOf(element).some((declaration) => declaration.property === 'fill')
}

function repaint(value: string, color: Hex): string {
  return value.trim().toLowerCase() === 'none' ? value : color
}

function repaintStyle(style: string, color: Hex): string {
  const declarations = parseStyle(style)
  if (declarations.length === 0) {
    return style
  }
  return declarations
    .map(({ property, value }) =>
      (PAINT_PROPERTIES as readonly string[]).includes(property)
        ? `${property}:${repaint(value, color)}`
        : `${property}:${value}`,
    )
    .join(';')
}
