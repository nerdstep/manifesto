import { join } from 'node:path'

import { hashSource } from '../pipeline/index.ts'
import type { AssetBundleSessionDesired } from '../shared/rpc.ts'
import { inspectTarget } from './bundle-writer.ts'
import type { TargetState } from './bundle-writer.ts'

function continuation(name: string): { base: string; start: number } {
  const match = /^(.*)-([0-9]+)$/u.exec(name)
  const suffix = Number(match?.[2])
  return match !== null &&
    (match[1]?.length ?? 0) > 0 &&
    Number.isSafeInteger(suffix) &&
    suffix >= 2
    ? { base: match[1] ?? name, start: suffix + 1 }
    : { base: name, start: 2 }
}

export function recoverTarget(
  root: string,
  requested: string,
  sourceHash: string,
): { bundleName: string; found: TargetState } {
  const { base, start } = continuation(requested)
  let available: { bundleName: string; found: TargetState } | null = null

  for (let suffix = start; suffix < 1000; suffix += 1) {
    const bundleName = `${base}-${suffix}`
    const found = inspectTarget(join(root, bundleName), sourceHash)
    if (found.kind === 'same-mark') {
      return { bundleName, found }
    }
    if (found.kind === 'empty' && available === null) {
      available = { bundleName, found }
    }
  }

  if (available === null) {
    throw new Error(`Could not find a safe folder name for “${requested}”.`)
  }
  return available
}

export function resolveTarget(next: AssetBundleSessionDesired): {
  desired: AssetBundleSessionDesired
  found: TargetState
  notice?: string
} {
  const sourceHash = hashSource(next.sourceSvg)
  const found = inspectTarget(join(next.outputRoot, next.bundleName), sourceHash)
  if (found.kind !== 'different-mark' && found.kind !== 'unknown-folder') {
    return { desired: next, found }
  }

  const requested = next.bundleName
  const recovered = recoverTarget(next.outputRoot, requested, sourceHash)
  return {
    desired: { ...next, bundleName: recovered.bundleName },
    found: recovered.found,
    notice: `“${requested}” was already in use. Using “${recovered.bundleName}” instead.`,
  }
}
