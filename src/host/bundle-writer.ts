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

export type Sidecar = {
  sourceHash: string
  bundleName: string
  settings: Settings
  generatedAt: string
  generator: string
}

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

/** Unknown non-empty folders are collisions because Manifesto cannot safely replace them. */
export type TargetState =
  | { kind: 'empty' }
  | { kind: 'same-mark'; sidecar: ReadSidecar }
  | { kind: 'different-mark'; sidecar: ReadSidecar }
  | { kind: 'unknown-folder' }

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

/** Validate folder names at the host boundary before inspecting the filesystem. */
export function bundleNameProblem(name: string): string | null {
  if (name.length === 0 || name.trim().length === 0) {
    return 'Enter a folder name.'
  }
  if (name !== name.trim()) {
    return 'Remove the leading or trailing spaces from the folder name.'
  }
  if (name.length > 100) {
    return 'Use a folder name with 100 characters or fewer.'
  }
  if (name === '.' || name === '..') {
    return `Choose a folder name other than "${name}".`
  }
  if (name.endsWith('.')) {
    return 'Remove the trailing period from the folder name.'
  }
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

type ReadSidecar = {
  sourceHash: string
  generatedAt: string
  settings: unknown
}

function readSidecar(dir: string): ReadSidecar | null {
  const path = join(dir, SIDECAR_FILENAME)
  if (!existsSync(path)) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!isPlainObject(parsed)) {
      return null
    }

    // Sidecar values remain unknown until validated.
    const { sourceHash, generatedAt, settings }: Record<string, unknown> = parsed
    if (typeof sourceHash !== 'string') {
      return null
    }

    return {
      sourceHash,
      generatedAt: typeof generatedAt === 'string' ? generatedAt : 'an earlier run',
      settings,
    }
  } catch {
    return null
  }
}

function isSettings(value: unknown): value is Settings {
  if (!isPlainObject(value)) {
    return false
  }
  const strings = ['name', 'shortName', 'themeColor', 'iconBackground', 'splashBackground']
  return (
    strings.every((key) => typeof value[key] === 'string') && typeof value.optimizeSvg === 'boolean'
  )
}

export function inspectTarget(dir: string, sourceHash: string): TargetState {
  if (!existsSync(dir)) {
    return { kind: 'empty' }
  }
  if (readdirSync(dir).length === 0) {
    return { kind: 'empty' }
  }

  const sidecar = readSidecar(dir)
  if (sidecar === null) {
    return { kind: 'unknown-folder' }
  }

  return sidecar.sourceHash === sourceHash
    ? { kind: 'same-mark', sidecar }
    : { kind: 'different-mark', sidecar }
}

/** Find the first available suffixed folder name. */
export function nextAvailableName(root: string, base: string): string {
  if (!existsSync(join(root, base))) {
    return base
  }

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!existsSync(join(root, candidate))) {
      return candidate
    }
  }

  throw new Error(`Could not find a free folder name for "${base}" under ${root}`)
}

/** Commit authored files without deleting unrelated files in the target directory. */
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

    // Stage the complete write before changing the destination.
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
    // Preserve the original error while attempting to restore the previous files.
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
      if (temporary === null) {
        continue
      }
      if (temporary === backups && preserveBackups) {
        continue
      }
      try {
        fileSystem.rmSync(temporary, { force: true, recursive: true })
      } catch (cleanupError) {
        console.error('[manifesto] could not clean a temporary Bundle directory:', cleanupError)
      }
    }
  }
}

export function recallSettings(dir: string): Settings | null {
  const settings = readSidecar(dir)?.settings
  return isSettings(settings) ? settings : null
}
