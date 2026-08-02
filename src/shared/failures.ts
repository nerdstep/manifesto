/**
 * What the user is told when generation fails outright.
 *
 * Shared by the app and the CLI for the same reason as the advisory copy: two
 * descriptions of one failure drift apart until they contradict each other.
 *
 * **Host-side only.** Unlike `bundle.ts` and `color.ts`, this needs the error classes as
 * values for `instanceof`, so it must never be imported from `src/webview/`. The webview
 * receives the finished string over RPC and has no reason to reach for this.
 *
 * The governing rule here is that internal vocabulary stops at this boundary. The user did
 * not choose resvg, did not ask for an alpha scan, and should never see either word — the
 * raw cause is worth logging, never worth showing. Two of these messages exist purely to
 * intercept text that was previously passed straight through.
 */

import { EmptyMarkError, InvalidSvgError } from '../pipeline/types.ts'

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
      "There's nothing to draw in this SVG. If your logo is live text, it renders blank " +
      'without its font — convert the text to outlines and export it again. The same ' +
      'happens when everything in the file is hidden or fully transparent.'
    )
  }

  if (error instanceof InvalidSvgError) {
    // Deliberately NOT `error.message`: that carries the parser's own words, which name
    // the rendering library and describe the file in terms the reader has no use for.
    return (
      "This file couldn't be read as SVG. If it opens in your design tool, try exporting " +
      'it again — some tools write SVG that browsers accept but renderers reject.'
    )
  }

  return "Something went wrong generating the icons, and it isn't a cause Manifesto recognises."
}

/**
 * The underlying error text, for the log rather than the interface.
 *
 * Pairs with `describeFailure`: the user gets the sentence, the developer gets the cause.
 */
export function failureDetail(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}
