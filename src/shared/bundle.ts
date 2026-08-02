/**
 * Facts about an Asset Bundle that the webview also needs.
 *
 * **This file must never import anything.** It exists because the UI needs these values,
 * and reaching into the pipeline for them pulls `svgo`, `ico-endec` and `node:crypto`
 * into the browser bundle — 1.88 MB that then fails to load, taking the drop handlers
 * with it. The pipeline re-exports both, so nothing else has to know they live here.
 *
 * `test/webview-purity.test.ts` asserts the no-imports rule.
 */

/** Every filename an Asset Bundle contains, in the order the UI should list them. */
export const BUNDLE_FILENAMES = [
  'favicon.ico',
  'favicon.svg',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'site.webmanifest',
] as const

/** `site.webmanifest` — the one file in a Bundle that is not an image. */
export const MANIFEST_FILENAME = 'site.webmanifest'

/**
 * The image files in an Asset Bundle: everything except `site.webmanifest`.
 *
 * Derived rather than counted by hand. The drop zone tells the user how many files they
 * are about to get, and that sentence was wrong — it said seven, which is the *total*
 * including the manifest — for as long as the number was typed out in prose.
 */
export const ICON_FILENAMES = BUNDLE_FILENAMES.filter((name) => name !== MANIFEST_FILENAME)

/**
 * The bookkeeping file written beside every Bundle.
 *
 * Not one of `BUNDLE_FILENAMES` — it is Manifesto's record of the settings used, not an
 * asset the user's site references. It lives here because the file list has to disclose
 * it: it lands in the same folder, so a UI that never mentions it makes the app look like
 * it wrote something extra without saying so.
 */
export const SIDECAR_FILENAME = 'manifesto.json'

/**
 * Class names on the two marks embedded in a dual-mode `favicon.svg`.
 *
 * Deliberately unlike anything an author would write, so the toggle rules inside that
 * file cannot match content within either mark.
 *
 * The webview needs them because the browser-tab preview renders `favicon.svg` inline and
 * *forces* which half is visible — the file itself swaps on `prefers-color-scheme`, and a
 * preview that can only ever show the viewer's own OS theme cannot show both mocks
 * truthfully. Overriding needs the exact class names, so they live here rather than being
 * guessed at in two places.
 */
export const FAVICON_LIGHT_CLASS = 'mfo-light'
export const FAVICON_DARK_CLASS = 'mfo-dark'

/**
 * The `<link>` tags that reference an Asset Bundle. No variable parts.
 *
 * Copy-only. The app never parses or rewrites the user's HTML — that is a far bigger
 * promise than this app should make.
 */
export const HEAD_SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`

/** How many tags `HEAD_SNIPPET` contains, for copy that quotes the number. */
export const HEAD_SNIPPET_TAG_COUNT = HEAD_SNIPPET.split('\n').length
