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
 * Neither is visible in the source or catchable by `bun test`; both are obvious in the
 * built artifact. So look at the artifact.
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
 * Above this, something that does not belong in a browser has been bundled.
 *
 * The size limit does the heavy lifting for library leakage. Matching library *names* is
 * useless — `"svgo-pixel-drift"` is a legitimate Advisory kind in the webview, and the
 * naive version of this check flagged it. The 1.88 MB incident, by contrast, is
 * unmissable by size.
 */
const SIZE_LIMIT_KB = 200

/** Node builtins, matched in import position rather than as bare substrings. */
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
