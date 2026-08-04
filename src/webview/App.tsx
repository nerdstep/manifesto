import { useCallback, useEffect, useState } from 'preact/hooks'

import {
  DropZone,
  HeadSnippet,
  InContext,
  PipelineStrip,
  SettingsPanel,
  SourceRow,
  Terminal,
  WindowChrome,
} from './components/index.ts'
import { bun } from './rpc.ts'
import { useBundle } from './use-bundle.ts'

export function App() {
  const [outputRoot, setOutputRoot] = useState('Loading...')
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
    regenerate,
  } = useBundle()

  useEffect(() => {
    void (async () => {
      const { path } = await bun().request.getOutputRoot()
      setOutputRoot(path)
      // Log readiness only after the RPC round trip succeeds.
      bun().send.log({ level: 'info', message: 'webview ready' })
    })()
  }, [])

  const chooseRoot = useCallback(async () => {
    const previous = outputRoot
    const { path } = await bun().request.chooseOutputRoot()
    setOutputRoot(path)
    if (path !== previous) {
      regenerate('root-change')
    }
  }, [outputRoot, regenerate])

  const bundle = status.kind === 'done' ? status.bundle : null
  const written = bundle === null ? null : bundle.writtenTo

  const reveal = useCallback(async () => {
    if (written !== null) {
      await bun().request.revealInFolder({ path: written })
    }
  }, [written])

  return (
    <div class="flex h-screen min-h-0 flex-col overflow-hidden">
      <WindowChrome />

      <div class="app-viewport min-h-0 flex-1 overflow-y-auto">
        <main class="mx-auto max-w-6xl p-7">
          <header class="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line pb-5">
            <h1 class="text-display text-ink lowercase">manifesto</h1>
            <p class="text-sm font-semibold tracking-[0.16em] text-blue uppercase">
              Generate website icons from one SVG
            </p>
          </header>

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
            <p class="mt-4 rounded-lg border border-bad/50 bg-bad/8 px-3 py-2.5 text-ink">
              {status.error}
            </p>
          )}

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
              onChooseOutput={() => void chooseRoot()}
              onOpenOutput={() => void reveal()}
              canOpenOutput={written !== null}
              outputRoot={outputRoot}
            />
          )}

          <Terminal status={status} pending={pending} outputRoot={outputRoot} />

          {bundle !== null && <HeadSnippet />}
        </main>
      </div>
    </div>
  )
}
