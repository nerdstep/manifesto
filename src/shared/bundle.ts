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

export const HEAD_SNIPPET_TAGS = [
  {
    name: 'link',
    attributes: [
      ['rel', 'icon'],
      ['href', '/favicon.ico'],
      ['sizes', '32x32'],
    ],
  },
  {
    name: 'link',
    attributes: [
      ['rel', 'icon'],
      ['href', '/favicon.svg'],
      ['type', 'image/svg+xml'],
    ],
  },
  {
    name: 'link',
    attributes: [
      ['rel', 'apple-touch-icon'],
      ['href', '/apple-touch-icon.png'],
    ],
  },
  {
    name: 'link',
    attributes: [
      ['rel', 'manifest'],
      ['href', '/site.webmanifest'],
    ],
  },
] as const

export const HEAD_SNIPPET = HEAD_SNIPPET_TAGS.map(
  ({ name, attributes }) =>
    `<${name} ${attributes.map(([attribute, value]) => `${attribute}="${value}"`).join(' ')}>`,
).join('\n')

export const HEAD_SNIPPET_TAG_COUNT = HEAD_SNIPPET_TAGS.length
