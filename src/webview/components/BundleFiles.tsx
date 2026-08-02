/**
 * What was written, and how big each file is.
 *
 * The list also has to account for `manifesto.json`, which lands in the same folder but is
 * not part of the Asset Bundle and so is not in `files`. Without the note below, the count
 * in the status line disagrees with the folder the user opens, and the app looks like it
 * quietly wrote something extra.
 */

import { BUNDLE_FILENAMES, SIDECAR_FILENAME } from '../../shared/bundle.ts'

/** base64 is 4 characters per 3 bytes — close enough for a size column. */
function decodedBytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4)
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`
}

export function BundleFiles({ files }: { files: Record<string, string> }) {
  // Listed in the documented order, so the UI reads the way the docs do.
  const ordered = [...BUNDLE_FILENAMES].filter((name) => name in files)

  return (
    <section class="mt-5" aria-label="Files written">
      <div class="rounded-xl border border-line bg-panel px-3.5">
        <table class="w-full border-collapse text-[13px]">
          <caption class="sr-only">
            The files written to your output folder, with their sizes
          </caption>
          <tbody>
            {ordered.map((filename) => (
              <tr key={filename} class="border-b border-line last:border-b-0">
                <td class="py-1.5 font-mono">{filename}</td>
                <td class="py-1.5 text-right text-xs text-muted">
                  {formatBytes(decodedBytes(files[filename] ?? ''))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-[11px] text-muted">
        <span class="font-mono">{SIDECAR_FILENAME}</span> is written alongside these. It records the
        settings used, so re-dropping the same logo restores them. Deleting it is safe.
      </p>
    </section>
  )
}
