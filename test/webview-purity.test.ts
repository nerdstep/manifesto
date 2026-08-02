/**
 * The webview must not pull the pipeline into the browser.
 *
 * This exists because it already happened. `import { HEAD_SNIPPET } from
 * '../pipeline/index.ts'` looked harmless — one string constant — but it dragged in
 * `svgo`, `ico-endec` and `node:crypto`, producing a 1.88 MB bundle that failed to load
 * in the webview. The failure was silent and misleading: with the module dead, no drop
 * handler was ever registered, so dropping a file just opened it.
 *
 * ## What enforces this, and where
 *
 * The import rule itself is now **`no-restricted-imports` in `.oxlintrc.json`**, not a
 * test. It is strictly better at that job: it runs in the editor, points at the exact
 * line, and — via `allowTypeImports` — distinguishes a value import from a type import,
 * which a regex over source text cannot do without reimplementing the distinction.
 *
 * It is also airtight rather than approximate, because it is paired with the same
 * restriction on `src/shared/**`. Per-file rules compose into the transitive property:
 * anything the webview can reach is itself unable to reach the host.
 *
 * What remains here is the part lint cannot express: facts that must agree across the
 * webview/pipeline seam, where the whole point is that the two sides cannot import each
 * other. A test can import both. The lint rule cannot.
 */

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { SAFE_ZONE_DIAMETER } from '../src/pipeline/index.ts'
import { SAFE_ZONE } from '../src/webview/components/preview-parts.tsx'

const SHARED_DIR = join(import.meta.dir, '..', 'src', 'shared')

/** Strip comments so prose about `node:crypto` doesn't trip the guard. */
function code(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\/\/.*$/gmu, '')
}

describe('webview purity', () => {
  test('the maskable preview draws the Safe Zone the pipeline actually fits to', () => {
    // The preview cannot import `SAFE_ZONE_DIAMETER` — that is a value import from the
    // pipeline, which the lint rule now rejects outright. So it holds its own copy, and
    // this is what keeps the copy honest. A ring drawn at the wrong diameter is worse
    // than no ring: it would certify marks that actually get clipped.
    expect(SAFE_ZONE).toBe(SAFE_ZONE_DIAMETER)
  })

  test('every module in src/shared is reachable from the webview', () => {
    // `src/shared/` only means anything if the whole directory obeys the webview's
    // restrictions — one module reaching into the host turns the per-file lint rule into
    // a rule that misses the case it exists for.
    //
    // The lint config enforces this for the paths it knows about. This catches the other
    // way in: a NEW top-level directory that nobody thought to add to the pattern list.
    // `src/host/` exists precisely because two modules failed this and had to move.
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
