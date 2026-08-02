/**
 * Manifesto CLI.
 *
 * Outside `src/pipeline/`, so this is a layer that may touch the filesystem — it reads
 * the mark, supplies the WASM bytes, and writes the Asset Bundle. All the real work
 * happens in the pure pipeline.
 *
 * It exists mainly so the pipeline is drivable before there is a window, but it is
 * genuinely useful on its own and there is no reason to delete it later.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

import { BUNDLE_FILENAMES, createPipeline, HEAD_SNIPPET } from '../pipeline/index.ts'
import type { Hex, Settings } from '../pipeline/index.ts'
import { describeAdvisory } from '../shared/advisories.ts'
import { describeFailure, failureDetail } from '../shared/failures.ts'

const USAGE = `
manifesto — drop an SVG, get every icon asset a website needs

  bun run cli <mark.svg> [outDir] [options]

Options
  --dark <file.svg>     Dark Mark, used on dark backgrounds and in favicon.svg
  --name <string>       Manifest name              (default: inferred)
  --short <string>      Manifest short_name        (default: inferred, or --name)
  --theme <#rrggbb>     theme_color                (default: inferred)
  --bg <#rrggbb>        Icon Background            (default: inferred)
  --splash <#rrggbb>    Manifest background_color  (default: same as --bg)
  --no-optimize         Skip SVGO
  --snippet             Print the <head> snippet and exit
  -h, --help

Every default is what the app's panel would open with, so the CLI and a drop produce
the same Asset Bundle from the same mark.
`.trim()

/** Parse `--flag value` pairs and positional arguments. */
function parseArgs(argv: string[]) {
  const positional: string[] = []
  const flags = new Map<string, string | true>()

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? ''
    if (!arg.startsWith('--') && arg !== '-h') {
      positional.push(arg)
      continue
    }
    const key = arg.replace(/^--?/u, '')
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('-')) {
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
  if (value === undefined) return fallback
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

async function main(argv: string[]): Promise<number> {
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

  // Inference supplies every default, so a flag overrides exactly one field and nothing
  // else moves. This is the same call the panel opens with.
  const inferred = pipeline.inferSettings(sourceSvg, input)
  const explicitName = stringFlag(flags, 'name')
  const iconBackground = hexFlag(flags, 'bg', inferred.iconBackground)

  const settings: Settings = {
    name: explicitName ?? inferred.name,
    // A given `--name` wins over an inferred Short Name: the user has said what this is
    // called, and shortening their answer for them would be worse than repeating it.
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

  mkdirSync(outDir, { recursive: true })

  // Write in the documented order so the listing reads the way the docs do.
  const ordered = [...BUNDLE_FILENAMES].filter((f) => result.files.has(f))
  for (const filename of ordered) {
    const bytes = result.files.get(filename)
    if (bytes === undefined) continue
    writeFileSync(join(outDir, filename), bytes)
    console.log(`  ${filename.padEnd(24)} ${String(bytes.length).padStart(7)} bytes`)
  }

  const missing = [...BUNDLE_FILENAMES].filter((f) => !result.files.has(f))
  if (missing.length > 0) console.error(`\n! did not produce: ${missing.join(', ')}`)

  console.log(`\nWrote ${ordered.length} files to ${outDir}`)

  if (settings.optimizeSvg && result.optimizedBytes < result.originalBytes) {
    const saved = 1 - result.optimizedBytes / result.originalBytes
    console.log(
      `Source mark ${result.originalBytes} -> ${result.optimizedBytes} bytes (-${(saved * 100).toFixed(0)}%)`,
    )
  }

  for (const advisory of result.advisories) {
    console.log(`\n! ${describeAdvisory(advisory)}`)
  }

  console.log(`\nPaste into <head>:\n\n${HEAD_SNIPPET}\n`)
  return 0
}

/**
 * Only run when executed directly.
 *
 * Without this, importing anything from here — a test importing `nameFromFilename`,
 * say — runs the whole program as a side effect of the import.
 */
if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2))
  } catch (error) {
    process.exitCode = 1
    reportFailure(error)
  }
}

/**
 * The same sentence the app shows, plus the raw cause — which a terminal is the right
 * place for and a window is not.
 */
function reportFailure(error: unknown): void {
  console.error(`\n${describeFailure(error)}`)
  console.error(`\n  ${failureDetail(error)}`)
}
