/** Keep this module free of imports so it remains safe for the webview bundle. */

export const BUNDLE_FILENAMES = [
  'favicon.ico',
  'favicon.svg',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'site.webmanifest',
] as const

export const MANIFEST_FILENAME = 'site.webmanifest'

/** Derive the displayed icon count from the canonical file list. */
export const ICON_FILENAMES = BUNDLE_FILENAMES.filter((name) => name !== MANIFEST_FILENAME)

export const SIDECAR_FILENAME = 'manifesto.json'

/** Shared class names used to force light and dark favicon previews. */
export const FAVICON_LIGHT_CLASS = 'mfo-light'
export const FAVICON_DARK_CLASS = 'mfo-dark'

export const HEAD_SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`

export const HEAD_SNIPPET_TAG_COUNT = HEAD_SNIPPET.split('\n').length
