/**
 * The app shell: drop a mark, adjust it, see what was written.
 *
 * All the session logic — debouncing, request ordering, the drop→panel handoff — lives in
 * `useBundle`. What is left here is layout and the two things that are genuinely the
 * shell's own: the Output Root and revealing the folder.
 *
 * Phase 7 adds the context previews between the panel and the file list.
 */

import { useCallback, useEffect, useState } from 'preact/hooks'

import { DropZone } from './components/DropZone.tsx'
import { Results } from './components/Results.tsx'
import { SettingsPanel } from './components/SettingsPanel.tsx'
import { SourceRow } from './components/SourceRow.tsx'
import { bun } from './rpc.ts'
import { useBundle } from './use-bundle.ts'
import type { Status } from './use-bundle.ts'

const BUTTON =
  'rounded-lg border border-line bg-panel px-3 py-1.5 text-[13px] hover:border-muted shrink-0'

export function App() {
  const [outputRoot, setOutputRoot] = useState('—')
  const { status, session, pending, drop, open, patch, rename, attachDarkMark, clearDarkMark } =
    useBundle()

  useEffect(() => {
    void (async () => {
      const { path } = await bun().request.getOutputRoot()
      setOutputRoot(path)
      // Logged only after a round-trip succeeds, so it means "the channel works"
      // rather than "a message was queued at something that may not be listening".
      bun().send.log({ level: 'info', message: 'webview ready' })
    })()
  }, [])

  const chooseRoot = useCallback(async () => {
    const { path } = await bun().request.chooseOutputRoot()
    setOutputRoot(path)
  }, [])

  const bundle = status.kind === 'done' ? status.bundle : null

  const written = bundle === null ? null : bundle.writtenTo

  const reveal = useCallback(async () => {
    if (written !== null) await bun().request.revealInFolder({ path: written })
  }, [written])

  return (
    <main class="mx-auto max-w-5xl p-7">
      <h1 class="mb-4 text-xs font-semibold tracking-[0.12em] text-muted uppercase">Manifesto</h1>

      <DropZone onFile={drop} onChoose={open} busy={status.kind === 'working'} />

      <div class="mt-4 flex flex-wrap items-center gap-2.5">
        <button type="button" class={BUTTON} onClick={() => void chooseRoot()}>
          Choose output folder…
        </button>
        <span
          class="min-w-50 flex-1 font-mono text-xs break-all text-muted"
          // The path is the only thing here a screen reader cannot infer from context.
          aria-label={`Current output folder: ${outputRoot}`}
        >
          {outputRoot}
        </span>
        {written !== null && (
          // "Reveal" is a macOS word. This opens Explorer with the folder selected, and
          // "Open folder" is true of that on every platform.
          <button type="button" class={BUTTON} onClick={() => void reveal()}>
            Open folder
          </button>
        )}
      </div>

      <StatusLine status={status} pending={pending} />

      {status.kind === 'failed' && (
        <div class="mt-4 rounded-lg border border-bad/50 bg-bad/8 px-3 py-2.5 text-[13px]">
          {status.error}
        </div>
      )}

      {session !== null && bundle !== null && (
        <SourceRow
          filename={session.filename}
          originalBytes={bundle.originalBytes}
          optimizedBytes={bundle.optimizedBytes}
          optimizeSvg={session.settings.optimizeSvg}
          advisories={bundle.advisories}
          onToggle={(optimizeSvg) => {
            patch({ optimizeSvg })
          }}
        />
      )}

      {session !== null && (
        <SettingsPanel
          settings={session.settings}
          bundleName={session.bundleName}
          darkFilename={session.darkFilename}
          onPatch={patch}
          onRename={rename}
          onDarkMark={(file) => void attachDarkMark(file)}
          onClearDarkMark={clearDarkMark}
        />
      )}

      {bundle !== null && <Results bundle={bundle} />}
    </main>
  )
}

/**
 * What just happened to the user's files, in one line.
 *
 * A live region, because this is the only confirmation that anything was written and it
 * updates without the user moving focus. `polite` rather than `assertive`: it fires on
 * every debounced edit, and interrupting someone mid-word to say "saved" is worse than
 * telling them a moment later.
 */
function StatusLine({ status, pending }: { status: Status; pending: boolean }) {
  return (
    <p class="mt-3.5 min-h-4 text-xs text-muted" role="status" aria-live="polite">
      <StatusText status={status} pending={pending} />
    </p>
  )
}

function StatusText({ status, pending }: { status: Status; pending: boolean }) {
  // The drop zone already says "Rendering icons…" in the place the eye is. Repeating it
  // here was the same message twice.
  if (status.kind === 'idle' || status.kind === 'working') return null

  // The error panel below states the problem in full. "Nothing generated" added a second
  // sentence that carried no information the reader did not already have.
  if (status.kind === 'failed') return null

  // Held while a debounced change is in flight, so the line does not flicker between
  // "saved" and "saving" on every keystroke — it just says the newer of the two.
  if (pending) return <>Saving…</>

  const { bundle } = status
  const count = Object.keys(bundle.files).length

  // `writtenTo === null` has exactly one cause: the target folder holds files Manifesto
  // did not write, and the user either declined to resolve it or the change was a
  // debounced edit that is never allowed to prompt. Both are the same situation and both
  // have the same two ways out, so one message covers it — and it names them, which
  // "Generated 7 files but nothing was saved" did not.
  return bundle.writtenTo === null ? (
    <>
      <span class="text-bad">Nothing was saved.</span> The folder{' '}
      <span class="font-mono">{bundle.bundleName}</span> already holds files Manifesto did not
      write. Rename the folder below, or choose a different output folder.
    </>
  ) : (
    <>
      <span class="text-ok">Saved {count} files</span> to{' '}
      <span class="font-mono">{bundle.writtenTo}</span>
    </>
  )
}
