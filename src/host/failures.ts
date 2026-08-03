/**
 * What the user is told when generation fails outright.
 *
 * Shared by the app and the CLI for the same reason as the advisory copy: two
 * descriptions of one failure drift apart until they contradict each other.
 *
 * **`src/host/` is the layer the Bun shell and the CLI share.** It exists as its own
 * directory rather than living in `src/shared/` because this module needs the error
 * classes as *values*, for `instanceof`.
 *
 * In `src/shared/` that would have been a hole in the rule that keeps the view bundle
 * clean. The rule is per-file — "the webview may only import from `src/webview/`,
 * `src/shared/`, and `preact`" — and it is only airtight because `src/shared/` is closed
 * under that same restriction. One module in there reaching into the pipeline would let a
 * webview file satisfy every check while still dragging the pipeline into the browser.
 *
 * So the two directories mean different things, and `.oxlintrc.json` says so:
 * `src/shared/` is safe for the webview, `src/host/` never is.
 *
 * The governing rule here is that internal vocabulary stops at this boundary. The user did
 * not choose resvg, did not ask for an alpha scan, and should never see either word — the
 * raw cause is worth logging, never worth showing. Two of these messages exist purely to
 * intercept text that was previously passed straight through.
 */

import { EmptyMarkError, InvalidSvgError } from '../pipeline/types.ts'

/** A Bundle was rendered but the filesystem could not commit it. */
export class BundleWriteError extends Error {
  override readonly name = 'BundleWriteError'

  constructor(cause: unknown) {
    super('Manifesto could not write the icon files. Check the output folder and try again.', {
      cause,
    })
  }
}

/** The CLI found a Bundle file that it will not replace without explicit consent. */
export class BundleCollisionError extends Error {
  override readonly name = 'BundleCollisionError'

  constructor(files: string[]) {
    super(
      `The output folder already contains ${files.join(', ')}. ` +
        'Choose another folder or pass --force to replace them.',
    )
  }
}

/**
 * A message the user can act on, or `null` if this failure has no known cause.
 *
 * Returning `null` rather than a guess keeps the caller honest: an unrecognised error
 * gets a generic message plus its raw text in the log, instead of a confident sentence
 * about something we did not diagnose.
 */
export function describeFailure(error: unknown): string {
  if (error instanceof EmptyMarkError) {
    return (
      'This SVG has no visible artwork. Convert live text to outlines and export it again. ' +
      'Also check that the artwork is not hidden or fully transparent.'
    )
  }

  if (error instanceof InvalidSvgError) {
    // Deliberately NOT `error.message`: that carries the parser's own words, which name
    // the rendering library and describe the file in terms the reader has no use for.
    return 'Manifesto could not read this SVG. Try exporting it again from your design tool.'
  }

  if (error instanceof BundleWriteError) {
    return error.message
  }

  if (error instanceof BundleCollisionError) {
    return error.message
  }

  return 'Manifesto could not generate the icons. Try another SVG or check the output folder.'
}

/**
 * The underlying error text, for the log rather than the interface.
 *
 * Pairs with `describeFailure`: the user gets the sentence, the developer gets the cause.
 */
export function failureDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause =
    error.cause instanceof Error ? `; cause: ${error.cause.name}: ${error.cause.message}` : ''
  return `${error.name}: ${error.message}${cause}`
}
