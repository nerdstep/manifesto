/**
 * Writing an Asset Bundle to disk, shared by the desktop shell and the CLI.
 *
 * This is the only place in the app that can lose someone's work, so the collision guard
 * is the point of the module rather than a detail of it. Everything here is synchronous
 * and takes real paths — the tests use real temp directories, because mocking the
 * filesystem would test the mock.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { isPlainObject } from 'es-toolkit'

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

export type BundleWriterFileSystem = {
  existsSync: typeof existsSync
  mkdirSync: typeof mkdirSync
  mkdtempSync: typeof mkdtempSync
  renameSync: typeof renameSync
  rmSync: typeof rmSync
  writeFileSync: typeof writeFileSync
}

const nativeWriterFileSystem: BundleWriterFileSystem = {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
}

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
 * Explain why a user-entered Bundle Name cannot be one directory beneath the Output Root.
 *
 * This is enforced on the host, before any filesystem inspection. The webview is an
 * editor, not a trust boundary: a crafted RPC request must not turn a folder name into a
 * relative path, an absolute path, or a Windows device name.
 */
export function bundleNameProblem(name: string): string | null {
  if (name.length === 0 || name.trim().length === 0) return 'Enter a folder name.'
  if (name !== name.trim()) return 'Remove the leading or trailing spaces from the folder name.'
  if (name.length > 100) return 'Use a folder name with 100 characters or fewer.'
  if (name === '.' || name === '..') return `Choose a folder name other than "${name}".`
  if (name.endsWith('.')) return 'Remove the trailing period from the folder name.'
  if (/[<>:"/\\|?*]/u.test(name)) {
    return 'Use a folder name without < > : " / \\ | ? * characters.'
  }
  for (const character of name) {
    if ((character.codePointAt(0) ?? 0) < 32) {
      return 'Remove control characters from the folder name.'
    }
  }
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name)) {
    return `Choose another folder name; Windows reserves "${name}".`
  }

  return null
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

function readSidecar(dir: string): ReadSidecar | null {
  const path = join(dir, SIDECAR_FILENAME)
  if (!existsSync(path)) return null

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isPlainObject(parsed)) return null

    // A Sidecar without a usable hash is no better than none: it cannot answer the only
    // question we ask it, so the folder stays "unknown" and the user gets asked.
    // Annotated: `isPlainObject` narrows to `Record<PropertyKey, any>`, and these came
    // off disk, so they must stay unchecked until something checks them.
    const { sourceHash, generatedAt, settings }: Record<string, unknown> = parsed
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
  if (!isPlainObject(value)) return false
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
  fileSystem: BundleWriterFileSystem = nativeWriterFileSystem,
): { written: string[] } {
  const complete: Sidecar = {
    ...sidecar,
    generatedAt: new Date().toISOString(),
    generator: 'manifesto',
  }

  const parent = dirname(dir)
  const folder = basename(dir)
  let staging: string | null = null
  let backups: string | null = null
  let preserveBackups = false
  const installed: string[] = []
  const movedToBackup: Array<{ target: string; backup: string }> = []

  try {
    fileSystem.mkdirSync(parent, { recursive: true })
    staging = fileSystem.mkdtempSync(join(parent, `.${folder}.manifesto-stage-`))
    backups = fileSystem.mkdtempSync(join(parent, `.${folder}.manifesto-backup-`))

    // Stage every authored byte before touching the destination. The Sidecar is part of
    // the transaction: it must never describe a set of files that was not committed.
    for (const [filename, bytes] of bundle.files) {
      fileSystem.writeFileSync(join(staging, filename), bytes)
    }
    fileSystem.writeFileSync(
      join(staging, SIDECAR_FILENAME),
      `${JSON.stringify(complete, null, 2)}\n`,
    )

    fileSystem.mkdirSync(dir, { recursive: true })

    const authored = [...bundle.files.keys(), SIDECAR_FILENAME]
    for (const filename of authored) {
      const target = join(dir, filename)
      if (fileSystem.existsSync(target)) {
        const backup = join(backups, filename)
        fileSystem.renameSync(target, backup)
        movedToBackup.push({ target, backup })
      }

      fileSystem.renameSync(join(staging, filename), target)
      installed.push(target)
    }

    return { written: authored }
  } catch (error) {
    // Best-effort rollback keeps a transient disk/permission error from leaving a mixed
    // Bundle. If rollback itself fails, preserve the original error for the caller and log
    // the second failure for diagnosis.
    for (const target of installed.toReversed()) {
      try {
        fileSystem.rmSync(target, { force: true, recursive: true })
      } catch (rollbackError) {
        console.error('[manifesto] could not remove a partially committed file:', rollbackError)
      }
    }

    for (const { target, backup } of movedToBackup.toReversed()) {
      try {
        fileSystem.renameSync(backup, target)
      } catch (rollbackError) {
        preserveBackups = true
        console.error('[manifesto] could not restore a Bundle file during rollback:', rollbackError)
      }
    }

    throw error
  } finally {
    for (const temporary of [staging, backups]) {
      if (temporary === null) continue
      if (temporary === backups && preserveBackups) continue
      try {
        fileSystem.rmSync(temporary, { force: true, recursive: true })
      } catch (cleanupError) {
        console.error('[manifesto] could not clean a temporary Bundle directory:', cleanupError)
      }
    }
  }
}

/** Settings recorded by a previous run, so a re-drop restores choices rather than guessing. */
export function recallSettings(dir: string): Settings | null {
  const settings = readSidecar(dir)?.settings
  return isSettings(settings) ? settings : null
}
