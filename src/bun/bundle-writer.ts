/**
 * Writing an Asset Bundle to disk, and not destroying anything while doing it.
 *
 * This is the only place in the app that can lose someone's work, so the collision guard
 * is the point of the module rather than a detail of it. Everything here is synchronous
 * and takes real paths — the tests use real temp directories, because mocking the
 * filesystem would test the mock.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { BundleResult, Settings } from '../pipeline/index.ts'
import { SIDECAR_FILENAME } from '../shared/bundle.ts'

/** The `manifesto.json` written inside every Bundle. */
export type Sidecar = {
  /** Content hash of the Source Mark. The collision guard turns on this. */
  sourceHash: string
  bundleName: string
  settings: Settings
  /** Present so a Bundle can explain itself six months later. */
  generatedAt: string
  generator: string
}

/** Defined in `src/shared/` because the file list in the webview has to name it too. */
export { SIDECAR_FILENAME }

/**
 * What we found where a Bundle is about to be written.
 *
 * `unknown-folder` is deliberately treated as a collision. A directory we did not create
 * might be anything — someone's `public/`, a git worktree — and overwriting it because
 * the name happened to match would be the single worst thing this app could do.
 */
export type TargetState =
  | { kind: 'empty' }
  | { kind: 'same-mark'; sidecar: ReadSidecar }
  | { kind: 'different-mark'; sidecar: ReadSidecar }
  | { kind: 'unknown-folder' }

/**
 * A Bundle Name from a filename.
 *
 * Filesystem-safe and lowercase — deliberately independent of the Web App Manifest's
 * `name`, which is a display string with different constraints.
 */
export function slugify(filename: string): string {
  const stem = filename.replace(/\.[^.]*$/u, '')
  const slug = stem
    .normalize('NFKD')
    .replaceAll(/[^\w\s-]/gu, '')
    .trim()
    .replaceAll(/[\s_]+/gu, '-')
    .replaceAll(/-+/gu, '-')
    .replaceAll(/^-|-$/gu, '')
    .toLowerCase()

  return slug.length > 0 ? slug : 'icons'
}

/**
 * What we are willing to believe about a file on disk.
 *
 * Only `sourceHash` and `generatedAt` are load-bearing, so only those are guaranteed.
 * `settings` stays `unknown` until something actually validates it — a Sidecar could
 * have been hand-edited, or written by an older version with a different shape.
 */
type ReadSidecar = {
  sourceHash: string
  generatedAt: string
  settings: unknown
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readSidecar(dir: string): ReadSidecar | null {
  const path = join(dir, SIDECAR_FILENAME)
  if (!existsSync(path)) return null

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isObject(parsed)) return null

    // A Sidecar without a usable hash is no better than none: it cannot answer the only
    // question we ask it, so the folder stays "unknown" and the user gets asked.
    const { sourceHash, generatedAt, settings } = parsed
    if (typeof sourceHash !== 'string') return null

    return {
      sourceHash,
      generatedAt: typeof generatedAt === 'string' ? generatedAt : 'an earlier run',
      settings,
    }
  } catch {
    return null
  }
}

/** Every field a `Settings` needs, checked — this came off disk. */
function isSettings(value: unknown): value is Settings {
  if (!isObject(value)) return false
  const strings = ['name', 'shortName', 'themeColor', 'iconBackground', 'splashBackground']
  return (
    strings.every((key) => typeof value[key] === 'string') && typeof value.optimizeSvg === 'boolean'
  )
}

/** Decide whether writing here is safe. */
export function inspectTarget(dir: string, sourceHash: string): TargetState {
  if (!existsSync(dir)) return { kind: 'empty' }
  if (readdirSync(dir).length === 0) return { kind: 'empty' }

  const sidecar = readSidecar(dir)
  if (sidecar === null) return { kind: 'unknown-folder' }

  return sidecar.sourceHash === sourceHash
    ? { kind: 'same-mark', sidecar }
    : { kind: 'different-mark', sidecar }
}

/**
 * First free `name`, `name-2`, `name-3`… under `root`.
 *
 * Used when the user resolves a collision by keeping both.
 */
export function nextAvailableName(root: string, base: string): string {
  if (!existsSync(join(root, base))) return base

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!existsSync(join(root, candidate))) return candidate
  }

  throw new Error(`Could not find a free folder name for "${base}" under ${root}`)
}

/**
 * Write a Bundle and its Sidecar.
 *
 * Only writes the files it authored. Anything else already in the directory is left
 * alone — a Bundle that shrinks should not silently delete what the previous one wrote,
 * and this app never removes a file it cannot account for.
 */
export function writeBundle(
  dir: string,
  bundle: BundleResult,
  sidecar: Omit<Sidecar, 'generatedAt' | 'generator'>,
): { written: string[] } {
  mkdirSync(dir, { recursive: true })

  const written: string[] = []
  for (const [filename, bytes] of bundle.files) {
    writeFileSync(join(dir, filename), bytes)
    written.push(filename)
  }

  const complete: Sidecar = {
    ...sidecar,
    generatedAt: new Date().toISOString(),
    generator: 'manifesto',
  }
  writeFileSync(join(dir, SIDECAR_FILENAME), `${JSON.stringify(complete, null, 2)}\n`)
  written.push(SIDECAR_FILENAME)

  return { written }
}

/** Settings recorded by a previous run, so a re-drop restores choices rather than guessing. */
export function recallSettings(dir: string): Settings | null {
  const settings = readSidecar(dir)?.settings
  return isSettings(settings) ? settings : null
}
