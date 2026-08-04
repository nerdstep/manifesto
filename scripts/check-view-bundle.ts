/** Validate the built webview as a classic script with no host dependencies. */

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

/** Catch accidental host or pipeline imports without imposing a performance budget. */
const SIZE_LIMIT_KB = 200

/** Match external Node builtins that remain after bundling. */
const NODE_BUILTIN = /(?:require\(|import\(|from\s*)["'`]node:(\w+)/gu

if (!existsSync(BUNDLE)) {
  console.error(`No bundle at ${BUNDLE}\nRun \`bunx electrobun build\` first.`)
  process.exit(1)
}

const source = readFileSync(BUNDLE, 'utf8')
const sizeKb = Math.round(statSync(BUNDLE).size / 1024)
const problems: string[] = []

// Parse as the classic script Electrobun loads without executing it.
try {
  // oxlint-disable-next-line no-new, no-implied-eval, no-new-func
  new Function(source)
} catch (error) {
  problems.push(
    `does not parse as a classic script: ${error instanceof Error ? error.message : String(error)}\n` +
      `    Electrobun loads the view with <script src>, so module-only syntax ` +
      `(top-level await, import/export) is a syntax error.`,
  )
}

// A webview cannot resolve Node builtins.
const builtins = new Set([...source.matchAll(NODE_BUILTIN)].map((m) => `node:${m[1] ?? ''}`))
if (builtins.size > 0) {
  problems.push(
    `imports ${[...builtins].join(', ')} — a value import has pulled host code into the ` +
      `browser bundle, and it will fail to load`,
  )
}

// Size catches large dependencies that bundling has shimmed.
if (sizeKb > SIZE_LIMIT_KB) {
  problems.push(
    `is ${sizeKb} kB, over the ${SIZE_LIMIT_KB} kB limit — check for a stray value import`,
  )
}

// The bootstrap guard must survive in the copied HTML.
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
  for (const problem of problems) {
    console.error(`  - ${problem}`)
  }
  process.exit(1)
}

console.log(`View bundle OK — ${sizeKb} kB, parses as a classic script, no host imports.`)
