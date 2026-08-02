/**
 * Regenerate `test/golden/renditions.json`.
 *
 * Run deliberately — `bun run goldens` — and never to make a red suite go green. A
 * golden that changed without an intended pipeline change is the suite reporting a bug,
 * which is the only reason the file exists. Read the diff, say what moved and why, then
 * regenerate.
 */

import { writeFileSync } from 'node:fs'

import { GOLDEN_FILE, readGoldens, renderGoldens } from '../test/golden-helpers.ts'
import { testPipeline } from '../test/helpers.ts'

const pipeline = await testPipeline()

let previous: Record<string, string> = {}
try {
  previous = readGoldens()
} catch {
  console.log('No existing goldens — creating.')
}

const next = renderGoldens(pipeline)

const added = Object.keys(next).filter((k) => !(k in previous))
const removed = Object.keys(previous).filter((k) => !(k in next))
const changed = Object.keys(next).filter((k) => k in previous && previous[k] !== next[k])

writeFileSync(GOLDEN_FILE, `${JSON.stringify(next, null, 2)}\n`)

console.log(`Wrote ${Object.keys(next).length} goldens.`)
if (added.length > 0) console.log(`  added:   ${added.length}`)
if (removed.length > 0) console.log(`  removed: ${removed.length}`)
if (changed.length > 0) {
  console.log(`  CHANGED: ${changed.length}`)
  for (const key of changed) console.log(`    ${key}`)
  console.log('\nEvery line above is a pixel change. Make sure you meant it.')
}
