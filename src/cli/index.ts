import { existsSync, readFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

import { SIDECAR_FILENAME, writeBundle } from '../host/bundle-writer.ts'
import {
  BundleCollisionError,
  BundleWriteError,
  describeFailure,
  failureDetail,
} from '../host/failures.ts'
import { BUNDLE_FILENAMES, createPipeline, hashSource, HEAD_SNIPPET } from '../pipeline/index.ts'
import type { Hex, Settings } from '../pipeline/index.ts'
import { describeAdvisory } from '../shared/advisories.ts'

const USAGE = `
manifesto
Generate website icons from one SVG.

  bun run cli <mark.svg> [outDir] [options]

Options
  --dark <file.svg>     Dark Mark, used on dark backgrounds and in favicon.svg
  --name <string>       Manifest name              (inferred by default)
  --short <string>      Manifest short_name        (inferred or uses --name)
  --theme <#rrggbb>     theme_color                (inferred by default)
  --bg <#rrggbb>        Icon Background            (inferred by default)
  --splash <#rrggbb>    Manifest background_color  (uses --bg by default)
  --no-optimize         Skip SVGO
  --force               Replace existing Bundle files in the output directory
  --snippet             Print the <head> snippet and exit
  -h, --help

The CLI uses the same defaults as the app and produces the same files.
`.trim()

function parseArgs(argv: string[]) {
  const positional: string[] = []
  const flags = new Map<string, string | true>()
  const valueFlags = new Set(['dark', 'name', 'short', 'theme', 'bg', 'splash'])
  const booleanFlags = new Set(['help', 'h', 'no-optimize', 'force', 'snippet'])

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? ''
    if (!arg.startsWith('-')) {
      positional.push(arg)
      continue
    }

    const key = arg === '-h' ? 'h' : arg.replace(/^--/u, '')
    if (!valueFlags.has(key) && !booleanFlags.has(key)) {
      throw new Error(`Unknown option "${arg}". Run with --help to see the available options.`)
    }

    const next = argv[i + 1]
    if (valueFlags.has(key)) {
      if (next === undefined || next.startsWith('-')) {
        throw new Error(`--${key} needs a value.`)
      }
      flags.set(key, next)
      i += 1
    } else {
      flags.set(key, true)
    }
  }

  return { positional, flags }
}

function stringFlag(flags: Map<string, string | true>, key: string): string | undefined {
  const value = flags.get(key)
  return typeof value === 'string' ? value : undefined
}

function isHex(value: string): value is Hex {
  return /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/u.test(value)
}

function hexFlag(flags: Map<string, string | true>, key: string, fallback: Hex): Hex {
  const value = stringFlag(flags, key)
  if (value === undefined) {
    return fallback
  }
  if (!isHex(value)) {
    throw new Error(`--${key} must be a hex colour like #2E5BFF, got "${value}"`)
  }
  return value
}

function resvgWasmBytes(): ArrayBuffer {
  const buffer = readFileSync(
    join(import.meta.dir, '..', '..', 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm'),
  )
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

export async function main(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv)

  if (flags.has('help') || flags.has('h')) {
    console.log(USAGE)
    return 0
  }

  if (flags.has('snippet')) {
    console.log(HEAD_SNIPPET)
    return 0
  }

  const input = positional[0]
  if (input === undefined) {
    console.error(USAGE)
    return 1
  }

  const darkPath = stringFlag(flags, 'dark')
  const outDir = resolve(positional[1] ?? join('.', basename(input, extname(input))))

  const pipeline = await createPipeline(resvgWasmBytes())
  const sourceSvg = readFileSync(input, 'utf8')

  const inferred = pipeline.inferSettings(sourceSvg, input)
  const explicitName = stringFlag(flags, 'name')
  const iconBackground = hexFlag(flags, 'bg', inferred.iconBackground)

  const settings: Settings = {
    name: explicitName ?? inferred.name,
    // An explicit name also becomes the short name unless `--short` is set.
    shortName: stringFlag(flags, 'short') ?? explicitName ?? inferred.shortName,
    themeColor: hexFlag(flags, 'theme', inferred.themeColor),
    iconBackground,
    splashBackground: hexFlag(flags, 'splash', iconBackground),
    optimizeSvg: !flags.has('no-optimize'),
  }

  const result = pipeline.buildBundle(
    sourceSvg,
    darkPath === undefined ? null : readFileSync(darkPath, 'utf8'),
    settings,
  )

  const force = flags.has('force')
  const authoredFiles = [...BUNDLE_FILENAMES, SIDECAR_FILENAME]
  const existing = authoredFiles.filter((filename) => existsSync(join(outDir, filename)))
  if (existing.length > 0 && !force) {
    throw new BundleCollisionError(existing)
  }

  const bundleName = basename(outDir) || basename(input, extname(input)) || 'icons'
  let written: { written: string[] }
  try {
    written = writeBundle(outDir, result, {
      sourceHash: hashSource(sourceSvg),
      bundleName,
      settings,
    })
  } catch (error) {
    throw new BundleWriteError(error)
  }

  const ordered = [...BUNDLE_FILENAMES].filter((f) => result.files.has(f))
  for (const filename of ordered) {
    const bytes = result.files.get(filename)
    if (bytes === undefined) {
      continue
    }
    console.log(`  ${filename.padEnd(24)} ${String(bytes.length).padStart(7)} bytes`)
  }
  console.log(`  ${SIDECAR_FILENAME.padEnd(24)} recorded settings`)

  const missing = authoredFiles.filter((f) => !written.written.includes(f))
  if (missing.length > 0) {
    console.error(`\n! Missing files\n  ${missing.join(', ')}`)
  }

  console.log(`\nWrote ${written.written.length} files to ${outDir}`)

  if (settings.optimizeSvg && result.optimizedBytes < result.originalBytes) {
    const saved = 1 - result.optimizedBytes / result.originalBytes
    console.log(
      `Source mark ${result.originalBytes} -> ${result.optimizedBytes} bytes (-${(saved * 100).toFixed(0)}%)`,
    )
  }

  for (const advisory of result.advisories) {
    console.log(`\n! ${describeAdvisory(advisory)}`)
  }

  console.log(`\nPaste this into <head>\n\n${HEAD_SNIPPET}\n`)
  return 0
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2))
  } catch (error) {
    process.exitCode = 1
    reportFailure(error)
  }
}

function reportFailure(error: unknown): void {
  console.error(`\n${describeFailure(error)}`)
  console.error(`\n  ${failureDetail(error)}`)
}
