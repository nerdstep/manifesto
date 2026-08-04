/** Shared advisory wording for the app and CLI. Keep this module value-import-free. */

import type { Advisory } from '../pipeline/types.ts'

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}

export function describeAdvisory(advisory: Advisory): string {
  const prefix = advisory.origin === 'dark' ? 'Dark-mode logo. ' : ''

  switch (advisory.kind) {
    case 'wordmark':
      return (
        prefix +
        (`This logo is ${advisory.aspectRatio.toFixed(1)} times wider than it is tall. ` +
          `It may be hard to read at 16 px after it is fitted into a square. ` +
          `Use a monogram or symbol if one is available.`)
      )

    case 'text-elements':
      return (
        prefix +
        (`This SVG contains ${count(advisory.count, 'element')} with live text. ` +
          `The text may be missing if its font is not embedded. ` +
          `Convert the text to outlines and export the SVG again.`)
      )

    case 'external-image':
      return (
        prefix +
        (`Manifesto could not read ${count(advisory.hrefs.length, 'linked image')} ` +
          `(${advisory.hrefs.join(', ')}). ` +
          `${advisory.hrefs.length === 1 ? 'It was' : 'They were'} left out of the icons. ` +
          `Embed the artwork in the SVG if it is part of the logo.`)
      )

    case 'active-content-removed':
      return (
        prefix +
        (`Manifesto removed ${count(advisory.foreignObjects, 'embedded HTML block')} and ` +
          `${count(advisory.externalStyles, 'external style reference')} from the SVG before ` +
          `rendering because they can load content in a browser. ` +
          `Export the artwork without embedded HTML or external CSS.`)
      )

    case 'scripts-removed':
      return (
        prefix +
        (`Manifesto removed ${count(advisory.elements, 'script')} and ` +
          `${count(advisory.attributes, 'event handler')} from the SVG before rendering. ` +
          `Your original file was not changed.`)
      )

    case 'svgo-pixel-drift':
      return (
        prefix +
        (`Optimization changed ${advisory.percent.toFixed(2)}% of the artwork's pixels. ` +
          `Compare the previews and turn off optimization if anything looks wrong.`)
      )

    default: {
      const unhandled: never = advisory
      return JSON.stringify(unhandled)
    }
  }
}
