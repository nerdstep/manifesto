/**
 * Embed the generated icon into Windows executables.
 *
 * Electrobun 1.18.1's compiled CLI cannot resolve its bundled rcedit dependency, so its
 * built-in icon step warns and continues without changing the executables. Running this
 * through postBuild patches launcher.exe and bun.exe before compression; postPackage
 * patches Setup.exe and refreshes the already-created installer zip.
 */

import { existsSync } from 'node:fs'
import { copyFile, cp, mkdir, readdir, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

if (process.env.ELECTROBUN_OS !== 'win') process.exit(0)

const buildDir = process.env.ELECTROBUN_BUILD_DIR
const appName = process.env.ELECTROBUN_APP_NAME
const artifactDir = process.env.ELECTROBUN_ARTIFACT_DIR

if (buildDir === undefined || appName === undefined || artifactDir === undefined) {
  throw new Error('Electrobun did not provide its build hook environment')
}

const root = join(import.meta.dir, '..')
const icon = join(root, 'assets', 'app-icon.ico')
const rcedit = join(root, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe')

for (const required of [icon, rcedit]) {
  if (!existsSync(required)) throw new Error(`Required Windows icon asset is missing: ${required}`)
}

function embed(executable: string): void {
  const result = Bun.spawnSync([rcedit, executable, '--set-icon', icon], {
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if (result.exitCode !== 0) {
    throw new Error(`rcedit failed for ${executable} with exit code ${result.exitCode}`)
  }
  console.log(`Embedded Manifesto icon into ${basename(executable)}`)
}

function quotePowerShell(path: string): string {
  return path.replaceAll("'", "''")
}

const appBundle = join(buildDir, appName)
const launcher = [join(appBundle, 'bin', 'launcher.exe'), join(appBundle, 'bin', 'launcher')].find(
  (candidate) => existsSync(candidate),
)
const runtime = join(appBundle, 'bin', 'bun.exe')
const setup = join(buildDir, `${appName}-Setup.exe`)

if (launcher !== undefined) {
  embed(launcher)
  if (existsSync(runtime)) embed(runtime)
  else if (!existsSync(setup)) throw new Error(`Packaged Bun runtime is missing: ${runtime}`)

  const bundledIcon = join(appBundle, 'Resources', 'app.ico')
  await mkdir(dirname(bundledIcon), { recursive: true })
  await copyFile(icon, bundledIcon)
}

if (existsSync(setup)) {
  embed(setup)

  const stem = basename(setup, '.exe')
  const metadata = join(buildDir, `${stem}.metadata.json`)
  const archive = join(buildDir, `${stem}.tar.zst`)
  for (const required of [metadata, archive]) {
    if (!existsSync(required)) throw new Error(`Installer companion file is missing: ${required}`)
  }

  const zipName = (await readdir(artifactDir)).find((name) => name.endsWith(`${stem}.zip`))
  if (zipName === undefined) throw new Error(`Could not find the packaged ${stem}.zip artifact`)

  const staging = join(buildDir, '.manifesto-icon-installer')
  if (dirname(staging) !== buildDir) throw new Error(`Unsafe installer staging path: ${staging}`)

  await rm(staging, { recursive: true, force: true })
  try {
    const companions = join(staging, '.installer')
    await mkdir(companions, { recursive: true })
    await copyFile(setup, join(staging, basename(setup)))
    await cp(metadata, join(companions, basename(metadata)))
    await cp(archive, join(companions, basename(archive)))

    const destination = join(artifactDir, zipName)
    const command =
      `Compress-Archive -Path '${quotePowerShell(staging)}\\*' ` +
      `-DestinationPath '${quotePowerShell(destination)}' -Force`
    const zip = Bun.spawnSync(['powershell.exe', '-NoProfile', '-Command', command], {
      stdout: 'inherit',
      stderr: 'inherit',
    })
    if (zip.exitCode !== 0) {
      throw new Error(`Refreshing ${zipName} failed with exit code ${zip.exitCode}`)
    }
    console.log(`Refreshed ${zipName} with the branded installer`)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
