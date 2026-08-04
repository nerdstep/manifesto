import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

import { Utils } from 'electrobun/bun'

import { nextAvailableName } from '../host/bundle-writer.ts'
import { failureDetail } from '../host/failures.ts'

export type ChosenSvg = { svg: string; filename: string }

/** Return SVG text so the webview remains filesystem-free. */
export async function chooseSvg(startingFolder: string): Promise<ChosenSvg | null> {
  const picked = await Utils.openFileDialog({
    startingFolder,
    allowedFileTypes: 'svg',
    canChooseFiles: true,
    canChooseDirectory: false,
    allowsMultipleSelection: false,
  })

  const path = picked[0]
  if (path === undefined || path.length === 0) {
    return null
  }

  try {
    return { svg: readFileSync(path, 'utf8'), filename: basename(path) }
  } catch (error) {
    console.error('[manifesto] could not read the chosen file:', failureDetail(error))
    return null
  }
}

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

export async function resolveCollision(
  root: string,
  bundleName: string,
  detail: string,
): Promise<string | null> {
  const keepBoth = nextAvailableName(root, bundleName)

  const { response } = await Utils.showMessageBox({
    type: 'question',
    title: 'Folder already exists',
    message: `"${bundleName}" is already in your output folder.`,
    detail: `${detail}\n\nOverwrite replaces the icon files. Other files in the folder are left alone.`,
    buttons: [`Save as "${keepBoth}"`, 'Overwrite', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  })

  if (response === 0) {
    return keepBoth
  }
  if (response === 1) {
    return bundleName
  }
  return null
}
