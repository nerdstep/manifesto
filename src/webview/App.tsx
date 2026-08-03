/**
 * The app shell, arranged along the Signal Path: source at the top, the pipeline beneath
 * it, then everything that came out the other side.
 *
 * All the session logic — debouncing, request ordering, the drop→panel handoff — lives in
 * `useBundle`. What is left here is layout and the two things that are genuinely the
 * shell's own: the Output Root and opening the folder.
 */

import { useCallback, useEffect, useState } from 'preact/hooks'

import { DropZone } from './components/DropZone.tsx'
import { PipelineStrip } from './components/PipelineStrip.tsx'
import { InContext, OnDisk } from './components/Results.tsx'
import { SettingsPanel } from './components/SettingsPanel.tsx'
import { SourceRow } from './components/SourceRow.tsx'
import { Terminal } from './components/Terminal.tsx'
import { Button } from './components/ui.tsx'
import { bun } from './rpc.ts'
import { useBundle } from './use-bundle.ts'

export function App() {
  const [outputRoot, setOutputRoot] = useState('—')
  const {
    status,
    session,
    pending,
    drop,
    open,
    patch,
    rename,
    attachDarkMark,
    chooseDarkMark,
    clearDarkMark,
  } = useBundle()

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
    // `max-w-6xl`, not 5xl: the source pane and the pipeline share a row, and five stages
    // plus four arrows need 544px. At 5xl the strip got 540 and wrapped "Export" onto a
    // row of its own. Widening the window alone would not have helped — the max-width was
    // the binding constraint.
    <main class="mx-auto max-w-6xl p-7">
      <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line pb-5">
        {/* Solid fill. The brand asset's wordmark carries a gradient; at UI sizes
            `background-clip: text` turns to mud, and it is a tell besides. */}
        <h1 class="text-[30px] leading-none font-extrabold tracking-[-0.03em] text-ink lowercase">
          manifesto
        </h1>
        <p class="text-[11px] font-semibold tracking-[0.16em] text-blue uppercase">
          From one SVG to every web asset
        </p>
      </header>

      {/*
        Source and pipeline share a row, left to right, because that is the product: one
        file in, five named stages, artefacts out. Stacked on narrow windows, where the
        arrow of the layout would be lost anyway.
      */}
      <div class="mt-5 grid items-stretch gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <DropZone
          onFile={drop}
          onChoose={open}
          busy={status.kind === 'working'}
          filename={session?.filename ?? null}
          sourceSvg={session?.sourceSvg ?? null}
        />
        <PipelineStrip
          state={status.kind === 'working' ? 'working' : bundle === null ? 'idle' : 'done'}
          bundle={bundle}
        />
      </div>

      {session !== null && bundle !== null && (
        <SourceRow
          originalBytes={bundle.originalBytes}
          optimizedBytes={bundle.optimizedBytes}
          optimizeSvg={session.settings.optimizeSvg}
          advisories={bundle.advisories}
          onToggle={(optimizeSvg) => {
            patch({ optimizeSvg })
          }}
        />
      )}

      {status.kind === 'failed' && (
        <p class="mt-4 rounded-lg border border-bad/50 bg-bad/8 px-3 py-2.5 text-[13px] text-ink">
          {status.error}
        </p>
      )}

      {/* Icons first, then the controls that change them, then what landed. */}
      {bundle !== null && <InContext bundle={bundle} />}

      {session !== null && (
        <SettingsPanel
          settings={session.settings}
          bundleName={session.bundleName}
          darkFilename={session.darkFilename}
          onPatch={patch}
          onRename={rename}
          onDarkMark={(file) => void attachDarkMark(file)}
          onChooseDarkMark={() => void chooseDarkMark()}
          onClearDarkMark={clearDarkMark}
        />
      )}

      <Terminal status={status} pending={pending} outputRoot={outputRoot} />

      {bundle !== null && <OnDisk />}

      <div class="mt-3 flex flex-wrap items-center gap-2.5">
        <Button onClick={() => void chooseRoot()}>Choose output folder…</Button>
        {written !== null && (
          // "Reveal" is a macOS word. This opens Explorer with the folder selected, and
          // "Open folder" is true of that on every platform.
          <Button onClick={() => void reveal()}>Open folder</Button>
        )}
      </div>
    </main>
  )
}
