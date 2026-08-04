/** Remove active SVG content and report content that may not render. */

import { _collections, optimize as runSvgo } from 'svgo/browser'
import type { CustomPlugin, XastElement, XastParent } from 'svgo/browser'

import type { Advisory } from './types.ts'
import { InvalidSvgError } from './types.ts'

const TEXT_ELEMENTS = new Set(['text', 'textPath'])

/** Use SVGO's event list so detection matches its removal behavior. */
const EVENT_ATTRIBUTES = new Set<string>([
  ...(_collections.attrsGroups.animationEvent ?? []),
  ...(_collections.attrsGroups.documentEvent ?? []),
  ...(_collections.attrsGroups.documentElementEvent ?? []),
  ...(_collections.attrsGroups.globalEvent ?? []),
  ...(_collections.attrsGroups.graphicalEvent ?? []),
])

export type ValidationResult = {
  sanitized: string
  advisories: Advisory[]
}

type Findings = {
  textElements: number
  scriptElements: number
  eventAttributes: number
  unresolvableImages: string[]
  foreignObjects: number
  externalStyles: number
}

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
    // Relative and remote images have no resolvable base in the pipeline.
    if (href !== undefined && href !== '' && !href.startsWith('data:')) {
      into.unresolvableImages.push(href)
    }
  }
}

/** Collect findings before `removeScripts` changes the document. */
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

/** Replace the child array so adjacent nodes are not skipped by the visitor. */
function detach(node: XastElement, parentNode: XastParent): void {
  parentNode.children = parentNode.children.filter((child) => child !== node)
}

function sanitizeCss(css: string): { css: string; changed: boolean } {
  let changed = false
  const withoutImports = css.replaceAll(/@import\b[^;]*(?:;|$)/giu, () => {
    changed = true
    return ''
  })
  const sanitized = withoutImports.replaceAll(
    /url\(\s*(["']?)([^)]*?)\1\s*\)/giu,
    (match: string, _quote: string, href: string) => {
      const reference = href.trim()
      if (reference.startsWith('#') || reference.toLowerCase().startsWith('data:')) return match
      changed = true
      return 'none'
    },
  )
  return { css: sanitized, changed }
}

function removeActiveContent(into: Findings): CustomPlugin {
  return {
    name: 'manifesto-remove-active-content',
    fn: () => ({
      element: {
        enter: (node: XastElement, parentNode: XastParent) => {
          if (localName(node.name) === 'foreignObject') {
            into.foreignObjects += 1
            detach(node, parentNode)
            return
          }

          const inlineStyle = node.attributes.style
          if (inlineStyle !== undefined) {
            const safe = sanitizeCss(inlineStyle)
            if (safe.changed) {
              into.externalStyles += 1
              node.attributes.style = safe.css
            }
          }

          if (localName(node.name) !== 'style') return

          const css = node.children
            .filter((child) => child.type === 'text' || child.type === 'cdata')
            .map((child) => child.value)
            .join('')
          const safe = sanitizeCss(css)
          if (!safe.changed) return

          into.externalStyles += 1
          node.children = [{ type: 'text', value: safe.css }]
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
    foreignObjects: 0,
    externalStyles: 0,
  }

  let stripped: string
  try {
    stripped = runSvgo(svg, {
      plugins: [collector(findings), removeActiveContent(findings), 'removeScripts'],
      js2svg: { pretty: false },
    }).data
  } catch (cause) {
    throw new InvalidSvgError(`This file could not be parsed as SVG: ${String(cause)}`, {
      cause,
    })
  }

  const scriptsRemoved = findings.scriptElements + findings.eventAttributes
  const activeContentRemoved = findings.foreignObjects + findings.externalStyles

  // Preserve the original bytes when sanitization makes no changes.
  const sanitized = scriptsRemoved + activeContentRemoved > 0 ? stripped : svg

  const advisories: Advisory[] = []

  if (scriptsRemoved > 0) {
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

  if (findings.foreignObjects > 0 || findings.externalStyles > 0) {
    advisories.push({
      kind: 'active-content-removed',
      foreignObjects: findings.foreignObjects,
      externalStyles: findings.externalStyles,
    })
  }

  return { sanitized, advisories }
}
