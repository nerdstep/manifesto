/** Validate the packaged layout, required files, and bundle size. */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BUILD = join(import.meta.dir, '..', 'build', 'stable-win-x64', 'Manifesto')
const RESOURCES = join(BUILD, 'Resources')

/** Files that must be in the payload, with the smallest size that could be real. */
const REQUIRED: [path: string, minBytes: number][] = [
  ['Manifesto/Resources/app.ico', 1_000],
  ['Manifesto/Resources/app/resvg.wasm', 2_000_000],
  ['Manifesto/Resources/app/bun/index.js', 100_000],
  ['Manifesto/Resources/app/views/mainview/index.js', 5_000],
  ['Manifesto/Resources/app/views/mainview/index.html', 500],
  ['Manifesto/Resources/app/views/mainview/app.css', 2_000],
  ['Manifesto/Resources/app/views/mainview/app-icon.png', 1_000],
]

/** A ceiling on bulk arriving from dependencies. The bundle is ~1.3 MB. */
const BUN_BUNDLE_LIMIT_MB = 3

const problems: string[] = []

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

if (!existsSync(RESOURCES)) {
  fail(`No packaged build at ${BUILD}\nRun \`bun run dist\` first.`)
}

const archive = readdirSync(RESOURCES).find((name) => name.endsWith('.tar.zst'))
if (archive === undefined) {
  fail(`No .tar.zst payload in ${RESOURCES}`)
}

const work = mkdtempSync(join(tmpdir(), 'manifesto-pkg-'))

try {
  const tar = join(work, 'app.tar')

  // Bun decompresses zstd itself. The v1 script shelled out to the `zig-zstd.exe` that
  // shipped inside `node_modules/electrobun`; Electrobun 2 has no such directory, and
  // the stable build keeps its copy inside the payload we are trying to open.
  try {
    writeFileSync(tar, Bun.zstdDecompressSync(readFileSync(join(RESOURCES, archive))))
  } catch (error) {
    fail(
      `could not decompress ${archive}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  // `tar -C <abs path>` is the portable form, but Git Bash's tar reads `C:\...` as a
  // remote host. Extract from the work directory with relative paths instead.
  const untar = Bun.spawnSync(['tar', '-xf', 'app.tar'], { cwd: work })
  if (untar.exitCode !== 0) {
    fail(`tar failed: ${untar.stderr.toString()}`)
  }

  for (const [path, minBytes] of REQUIRED) {
    const full = join(work, path)
    if (!existsSync(full)) {
      problems.push(`missing ${path}`)
      continue
    }
    const size = statSync(full).size
    if (size < minBytes) {
      problems.push(`${path} is ${size} bytes, expected at least ${minBytes} — probably truncated`)
    }
  }

  // ASAR would move the entrypoint to a temp file and break WASM resolution. `useAsar`
  // defaults to false; this is here so turning it on fails loudly rather than at runtime.
  if (existsSync(join(work, 'Manifesto', 'Resources', 'app.asar'))) {
    problems.push(
      'app.asar is present — the launcher extracts the entrypoint to a temp file, so ' +
        '`import.meta.dir` no longer points at Resources/app and resvg.wasm cannot be found',
    )
  }

  const bundlePath = join(work, 'Manifesto', 'Resources', 'app', 'bun', 'index.js')
  if (existsSync(bundlePath)) {
    const sizeMb = statSync(bundlePath).size / 1024 / 1024
    if (sizeMb > BUN_BUNDLE_LIMIT_MB) {
      problems.push(
        `bun/index.js is ${sizeMb.toFixed(1)} MB, over the ${BUN_BUNDLE_LIMIT_MB} MB limit — ` +
          `a dependency has pulled bulk into the main process`,
      )
    }
  }

  if (problems.length > 0) {
    console.error('Packaged app FAILED:')
    for (const problem of problems) {
      console.error(`  - ${problem}`)
    }
    process.exit(1)
  }

  const total = statSync(join(RESOURCES, archive)).size / 1024 / 1024
  const bundleMb = statSync(bundlePath).size / 1024 / 1024
  console.log(
    `Packaged app OK — payload ${total.toFixed(1)} MB, ` +
      `bun bundle ${bundleMb.toFixed(1)} MB, flat files, resvg.wasm in place.`,
  )
} finally {
  rmSync(work, { recursive: true, force: true })
}
