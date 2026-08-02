/**
 * Every native dialog the app opens.
 *
 * Three moments where the OS takes over the screen: choosing a Source Mark, choosing the
 * Output Root, and resolving a folder collision. They belong together because they share
 * one rule — a dialog is the *only* thing in this app allowed to interrupt the user, so
 * each one has to be worth a stolen moment of attention.
 *
 * Keeping them out of `index.ts` also keeps that file to startup, RPC wiring, and the
 * window, which is all it should be.
 */

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

import { Utils } from 'electrobun/bun'

import { failureDetail } from '../shared/failures.ts'
import { nextAvailableName } from './bundle-writer.ts'

/** A Source Mark the user picked, in the same shape a drop produces. */
export type ChosenSource = { sourceSvg: string; filename: string }

/**
 * The native file picker — the keyboard route into the app.
 *
 * Returns the SVG *text*, not a path, so the webview stays filesystem-free and this lands
 * in exactly the same shape as a drop. `null` means the user cancelled.
 */
export async function chooseSourceSvg(startingFolder: string): Promise<ChosenSource | null> {
  const picked = await Utils.openFileDialog({
    startingFolder,
    allowedFileTypes: 'svg',
    canChooseFiles: true,
    canChooseDirectory: false,
    allowsMultipleSelection: false,
  })

  const path = picked[0]
  if (path === undefined || path.length === 0) return null

  try {
    return { sourceSvg: readFileSync(path, 'utf8'), filename: basename(path) }
  } catch (error) {
    // Indistinguishable from a cancel at the wire, which is acceptable only because the
    // user selected this file from a native dialog moments ago — if it cannot be read now,
    // something is wrong outside this app. The log is where that belongs.
    console.error('[manifesto] could not read the chosen file:', failureDetail(error))
    return null
  }
}

/** The Output Root picker. Returns `null` when cancelled, so the caller keeps what it had. */
export async function chooseOutputRoot(startingFolder: string): Promise<string | null> {
  const picked = await Utils.openFileDialog({
    startingFolder,
    canChooseFiles: false,
    canChooseDirectory: true,
    allowsMultipleSelection: false,
  })

  const chosen = picked[0]
  return chosen !== undefined && chosen.length > 0 ? chosen : null
}

/**
 * Resolve a folder-name collision by asking, natively and modally.
 *
 * Modal is right here: the choice is destructive and there is no sensible way to carry on
 * without an answer. Returns the Bundle Name to use, or `null` to write nothing.
 */
export async function resolveCollision(
  root: string,
  bundleName: string,
  detail: string,
): Promise<string | null> {
  const keepBoth = nextAvailableName(root, bundleName)

  const { response } = await Utils.showMessageBox({
    type: 'question',
    title: 'That folder already has files in it',
    message: `"${bundleName}" already exists in your output folder.`,
    // The second sentence matters as much as the first. "Overwrite" sounds like it empties
    // the folder, and it does not — `writeBundle` only ever writes the files it authored
    // and never deletes anything. Saying so is the difference between an informed choice
    // and a guess about how destructive this is.
    detail: `${detail}\n\nOverwriting replaces the icon files with the new ones. Anything else in that folder is left alone.`,
    buttons: [`Save as "${keepBoth}"`, 'Overwrite', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  })

  if (response === 0) return keepBoth
  if (response === 1) return bundleName
  return null
}
