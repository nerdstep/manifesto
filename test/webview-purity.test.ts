/** Check cross-boundary values that lint cannot compare. */

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { SAFE_ZONE_DIAMETER } from '../src/pipeline/index.ts'
import { contrastRatio } from '../src/shared/color.ts'
import { contrastInk, SAFE_ZONE, svgUrl } from '../src/webview/components/preview-parts.tsx'

const SHARED_DIR = join(import.meta.dir, '..', 'src', 'shared')

/** Strip comments so prose about `node:crypto` doesn't trip the guard. */
function code(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\/\/.*$/gmu, '')
}

describe('webview purity', () => {
  test('the maskable preview draws the Safe Zone the pipeline actually fits to', () => {
    // Keep the webview's duplicated safe-zone value aligned with the pipeline.
    expect(SAFE_ZONE).toBe(SAFE_ZONE_DIAMETER)
  })

  test('preview text stays readable on arbitrary user-selected backgrounds', () => {
    for (const background of ['#4da3ff', '#808080', '#ff0000', '#7f00ff']) {
      expect(contrastRatio(background, contrastInk(background))).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('SVG previews stay in static image resources', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    const light = svgUrl(source)
    const dark = svgUrl(source, true)

    expect(light.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(dark.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    const lightSvg = decodeURIComponent(light.split(',', 2)[1] ?? '')
    const darkSvg = decodeURIComponent(dark.split(',', 2)[1] ?? '')
    expect(lightSvg).not.toContain('dangerouslySetInnerHTML')
    expect(lightSvg).toContain(
      '.mfo-dark{display:none!important}.mfo-light{display:inline!important}',
    )
    expect(darkSvg).toContain(
      '.mfo-light{display:none!important}.mfo-dark{display:inline!important}',
    )
  })

  test('webview source has no active SVG markup injection', () => {
    const webviewDir = join(import.meta.dir, '..', 'src', 'webview')
    const files = readdirSync(webviewDir, { recursive: true }).filter(
      (file): file is string => typeof file === 'string',
    )

    for (const name of files.filter((file) => /\.(?:ts|tsx)$/u.test(file))) {
      const source = code(readFileSync(join(webviewDir, name), 'utf8'))
      expect(source, `${name} must not inject SVG markup into the document`).not.toContain(
        'dangerouslySetInnerHTML',
      )
    }
  })

  test('every module in src/shared is reachable from the webview', () => {
    // Catch new top-level modules that bypass the lint path patterns.
    const allowed = /^(?:\.\/|\.\.\/)?(?!.*\/(?:pipeline|bun|cli|host|webview)\/)/u

    for (const name of readdirSync(SHARED_DIR)) {
      const source = code(readFileSync(join(SHARED_DIR, name), 'utf8'))

      for (const line of source.split('\n')) {
        const match = /^\s*import\s+(?!type\b)[^\n]*?from\s*['"]([^'"]+)['"]/u.exec(line)
        const specifier = match?.[1]
        if (specifier === undefined) continue

        expect(
          !specifier.startsWith('node:') && allowed.test(specifier),
          `src/shared/${name} value-imports "${specifier}", which the webview cannot resolve`,
        ).toBe(true)
      }
    }
  })
})
