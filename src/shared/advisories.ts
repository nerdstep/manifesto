/**
 * What each Advisory says to the user.
 *
 * One definition for both surfaces. The app and the CLI previously carried their own
 * wording for the same six conditions, which is how two descriptions of one fact drift
 * apart until they disagree.
 *
 * **Value-import-free** so the webview can use it. `import type` is fine — it erases.
 *
 * Every message follows the same shape, in this order:
 *
 *   1. what is true of the file,
 *   2. what will go wrong because of it,
 *   3. what to do about it.
 *
 * The consequence comes before the mechanism because the consequence is what the reader
 * is deciding about. And every message ends in an action — an advisory the reader cannot
 * act on is noise, and none of these block generation.
 *
 * Deliberately free of anything surface-specific ("check the previews", `--no-optimize`),
 * so the same sentence is true in a window and in a terminal.
 */

import type { Advisory } from '../pipeline/types.ts'

/** `1 script` / `2 scripts`, without the `(s)` that means the writer gave up. */
function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}

export function describeAdvisory(advisory: Advisory): string {
  const prefix = advisory.origin === 'dark' ? 'Dark Mark: ' : ''

  switch (advisory.kind) {
    case 'wordmark':
      return (
        prefix +
        (`This logo is ${advisory.aspectRatio.toFixed(1)}:1 — far wider than it is tall. ` +
          `Icons are square, so it has to shrink to fit and will be hard to read at 16px. ` +
          `A monogram or symbol usually works better.`)
      )

    case 'text-elements':
      return (
        prefix +
        (`This SVG contains live text (${count(advisory.count, 'element')}). ` +
          `Text renders blank unless its font is embedded, so it will be missing from the ` +
          `icons. Convert the text to outlines and export again.`)
      )

    case 'external-image':
      return (
        prefix +
        (`${count(advisory.hrefs.length, 'linked image')} couldn't be read, so ` +
          `${advisory.hrefs.length === 1 ? 'it was' : 'they were'} left out of the icons: ` +
          `${advisory.hrefs.join(', ')}. Embed the artwork in the SVG if it's part of the logo.`)
      )

    case 'active-content-removed':
      return (
        prefix +
        (`Removed ${count(advisory.foreignObjects, 'embedded HTML block')} and ` +
          `${count(advisory.externalStyles, 'external style reference')} from the SVG before ` +
          `rendering. They can run or load content when the SVG is opened in a browser. ` +
          `Export the artwork without embedded HTML or external CSS.`)
      )

    case 'scripts-removed':
      return (
        prefix +
        (`Removed ${count(advisory.elements, 'script')} and ` +
          `${count(advisory.attributes, 'event handler')} from the SVG before rendering. ` +
          `Icons shouldn't run code. Your original file wasn't changed.`)
      )

    case 'svgo-pixel-drift':
      return (
        prefix +
        (`Optimizing changed ${advisory.percent.toFixed(2)}% of the artwork's pixels, so the ` +
          `icons may not match your original exactly. Compare them, and turn off ` +
          `optimization if anything looks wrong.`)
      )

    default: {
      // Exhaustiveness: adding an Advisory kind without a message fails to compile.
      const unhandled: never = advisory
      return JSON.stringify(unhandled)
    }
  }
}
