/**
 * Check the built webview bundle before trusting it.
 *
 * Two bugs have now presented as "drag and drop doesn't work", both because the view
 * module failed to load and took the drop guards with it:
 *
 *   1. A value import from the pipeline pulled `node:crypto` into the browser bundle.
 *   2. Top-level await — a syntax error, because Electrobun serves the view with a plain
 *      `<script src>`, which is a classic script and not a module.
 *
 * ## What this file is now responsible for
 *
 * **Bug 1 is no longer caught here.** `no-restricted-imports` in `.oxlintrc.json` rejects
 * it at the import, in the editor, naming the line. That is a better place for it.
 *
 * What is left is what lint cannot see: **the artifact, including its dependencies.** The
 * lint rule reads our source. If `preact` — or anything it pulls — reaches for a Node
 * builtin, or a dependency quietly grows by a megabyte, only the built file shows it.
 *
 * Run: `bun run check:bundle` (after `electrobun build`).
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BUNDLE = join(
  import.meta.dir,
  '..',
  'build',
  'dev-win-x64',
  'Manifesto-dev',
  'Resources',
  'app',
  'views',
  'mainview',
  'index.js',
)

/**
 * A canary, not a performance budget.
 *
 * There is no network here and no user-facing cost to a large bundle: the view loads from
 * local disk and 200 kB of JS parses in about a millisecond. The number exists only to
 * notice something arriving that nobody meant to add.
 *
 * Measured, so the threshold is not guesswork. Anything the view could plausibly pull in
 * by accident is far above it, and everything legitimate is far below:
 *
 * | the shared modules the view actually uses |     1 kB |
 * | the whole view bundle today               |    38 kB |
 * | `react-aria-components` via preact/compat |   170 kB |
 * | `svgo/browser` alone                      |   541 kB |
 * | the pipeline barrel (the 1.88 MB bug)     |  1061 kB |
 *
 * The gap between 38 and 170 is where this sits. Note what the table also says: a limit
 * this far above the current size gives no *early* warning, so if the view ever grows
 * past ~100 kB legitimately, this number needs revisiting rather than raising.
 *
 * Matching library *names* instead was tried and abandoned — `"svgo-pixel-drift"` is a
 * legitimate Advisory kind in the webview, and the naive version flagged it.
 */
const SIZE_LIMIT_KB = 200

/**
 * Node builtins, matched in import position rather than as bare substrings.
 *
 * Weaker than it looks, and worth knowing why. Bundling the pipeline for a browser target
 * produces 1.1 MB containing `createHash` and `sha256` and **zero `node:` import
 * statements** — Bun resolves the builtin into a shim rather than leaving an import to
 * match. So this would not have fired on the bug it was written for.
 *
 * It stays because it covers the one case nothing else does: a *dependency* that reaches
 * for a builtin and is left external. Our own source is covered by lint, and the size
 * limit covers bulk. This covers neither, which is precisely why all three are here.
 */
const NODE_BUILTIN = /(?:require\(|import\(|from\s*)["'`]node:(\w+)/gu

if (!existsSync(BUNDLE)) {
  console.error(`No bundle at ${BUNDLE}\nRun \`bunx electrobun build\` first.`)
  process.exit(1)
}

const source = readFileSync(BUNDLE, 'utf8')
const sizeKb = Math.round(statSync(BUNDLE).size / 1024)
const problems: string[] = []

// 1. Does it parse as a CLASSIC script? `new Function` parses without executing, so a
//    bundle referencing `window` is fine — only syntax is checked.
try {
  // The Function constructor is the point: it PARSES without executing, which is
  // exactly the check we want. Nothing is ever called, and the input is our own build
  // output.
  // oxlint-disable-next-line no-new, no-implied-eval, no-new-func
  new Function(source)
} catch (error) {
  problems.push(
    `does not parse as a classic script: ${error instanceof Error ? error.message : String(error)}\n` +
      `    Electrobun loads the view with <script src>, so module-only syntax ` +
      `(top-level await, import/export) is a syntax error.`,
  )
}

// 2. Has a node builtin leaked in? Nothing in a webview can resolve one.
const builtins = new Set([...source.matchAll(NODE_BUILTIN)].map((m) => `node:${m[1] ?? ''}`))
if (builtins.size > 0) {
  problems.push(
    `imports ${[...builtins].join(', ')} — a value import has pulled host code into the ` +
      `browser bundle, and it will fail to load`,
  )
}

// 3. Size is the honest proxy for "something big got dragged in".
if (sizeKb > SIZE_LIMIT_KB) {
  problems.push(
    `is ${sizeKb} kB, over the ${SIZE_LIMIT_KB} kB limit — check for a stray value import`,
  )
}

// 4. The bootstrap guard must survive in the copied HTML. Without it, a broken module
//    means dropped files open instead of an error being shown.
const html = join(BUNDLE, '..', 'index.html')
if (existsSync(html)) {
  const markup = readFileSync(html, 'utf8')
  if (!markup.includes('preventDefault')) {
    problems.push('index.html has lost its inline drop-guard bootstrap')
  }
} else {
  problems.push('index.html was not copied into the bundle')
}

if (problems.length > 0) {
  console.error(`View bundle FAILED (${sizeKb} kB):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`View bundle OK — ${sizeKb} kB, parses as a classic script, no host imports.`)
