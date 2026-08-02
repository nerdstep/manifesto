/**
 * The webview must not pull the pipeline into the browser.
 *
 * This exists because it already happened. `import { HEAD_SNIPPET } from
 * '../pipeline/index.ts'` looked harmless — one string constant — but it dragged in
 * `svgo`, `ico-endec` and `node:crypto`, producing a 1.88 MB bundle that failed to load
 * in the webview.
 *
 * The failure was silent and misleading: with the module dead, no drop handler was ever
 * registered, so dropping a file just opened it. It reads exactly like "the framework
 * doesn't support drag and drop" — which is where the previous hour went in Phase 0.
 *
 * Type-only imports are fine; they erase.
 */

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { SAFE_ZONE_DIAMETER } from '../src/pipeline/index.ts'
import { SAFE_ZONE } from '../src/webview/components/preview-parts.tsx'

const WEBVIEW_DIR = join(import.meta.dir, '..', 'src', 'webview')

function webviewSources(): string[] {
  // Recursive and including .tsx — the components live in a subdirectory, and a guard
  // that silently stops covering half the webview is worse than none.
  return readdirSync(WEBVIEW_DIR, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    .map((f) => join(WEBVIEW_DIR, f))
}

/** Strip comments so prose about `node:crypto` doesn't trip the guard. */
function code(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\/\/.*$/gmu, '')
}

describe('webview purity', () => {
  const files = webviewSources()

  test('finds the webview sources', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const name = file.slice(WEBVIEW_DIR.length + 1)

    test(`${name} imports no runtime value from the pipeline`, () => {
      const lines = code(readFileSync(file, 'utf8')).split('\n')

      for (const line of lines) {
        const importsFromPipeline = /^\s*import\b[^\n]*['"][^'"]*\/pipeline\//u.test(line)
        if (!importsFromPipeline) continue

        expect(
          /^\s*import\s+type\b/u.test(line),
          `${name} imports a value from the pipeline — that pulls svgo, ico-endec and ` +
            `node:crypto into the browser bundle:\n    ${line.trim()}`,
        ).toBe(true)
      }
    })

    test(`${name} imports no node builtins`, () => {
      const lines = code(readFileSync(file, 'utf8')).split('\n')

      for (const line of lines) {
        expect(
          /['"]node:/u.test(line),
          `${name} imports a node builtin, which cannot resolve in a webview:\n    ${line.trim()}`,
        ).toBe(false)
      }
    })
  }

  test('the maskable preview draws the Safe Zone the pipeline actually fits to', () => {
    // The preview cannot import `SAFE_ZONE_DIAMETER` — that is a value import from the
    // pipeline, which is the 1.88 MB failure this whole file exists to prevent. So it
    // holds its own copy, and this is what keeps the copy honest. A ring drawn at the
    // wrong diameter is worse than no ring: it would certify marks that get clipped.
    expect(SAFE_ZONE).toBe(SAFE_ZONE_DIAMETER)
  })

  // These are shared precisely so the webview can have them without the pipeline. The
  // moment one grows a VALUE import, that stops being true. `import type` is fine: it
  // erases, so it cannot pull anything into the bundle — which is how `advisories.ts`
  // names the `Advisory` union without depending on the module that defines it.
  //
  // `src/shared/failures.ts` is deliberately NOT in this list. It needs the error classes
  // as values for `instanceof`, so it is host-side only; the test below keeps the webview
  // away from it.
  for (const name of ['bundle.ts', 'color.ts', 'advisories.ts']) {
    test(`src/shared/${name} has no value imports of its own`, () => {
      const source = code(readFileSync(join(import.meta.dir, '..', 'src', 'shared', name), 'utf8'))
      const valueImport = source
        .split('\n')
        .find((line) => /^\s*import\b/u.test(line) && !/^\s*import\s+type\b/u.test(line))

      expect(valueImport, `${name} must not import values: ${valueImport ?? ''}`).toBeUndefined()
    })
  }

  test('the webview does not import the host-side failure copy', () => {
    // `failures.ts` imports EmptyMarkError and InvalidSvgError as values. Harmless on the
    // Bun side, a pipeline import in the browser.
    for (const file of files) {
      const source = code(readFileSync(file, 'utf8'))
      expect(
        source.includes('shared/failures'),
        `${file.slice(WEBVIEW_DIR.length + 1)} imports shared/failures.ts, which is host-side only`,
      ).toBe(false)
    }
  })
})
