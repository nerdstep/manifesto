import { useState } from 'preact/hooks'

import { HEAD_SNIPPET_TAG_COUNT, ICON_FILENAMES } from '../../shared/bundle.ts'
import { Caption } from './ui.tsx'

type Props = {
  onFile: (file: File) => Promise<void>
  onChoose: () => Promise<void>
  busy: boolean
  filename: string | null
  sourceSvg: string | null
}

/**
 * Keep unvalidated SVG outside the application DOM. An image document cannot run scripts
 * or event handlers from the source file.
 */
function sourceUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function DropZone({ onFile, onChoose, busy, filename, sourceSvg }: Props) {
  const [over, setOver] = useState(false)
  const [rejected, setRejected] = useState(false)

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    setOver(false)
    if (busy) return

    const file = [...(event.dataTransfer?.files ?? [])].find((f) => /\.svg$/iu.test(f.name))
    if (file === undefined) {
      setRejected(true)
      return
    }

    setRejected(false)
    void onFile(file)
  }

  function choose() {
    if (busy) return
    setRejected(false)
    void onChoose()
  }

  const loaded = filename !== null

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop an SVG logo here, or activate to choose one"
        aria-busy={busy}
        aria-disabled={busy}
        aria-describedby={rejected ? 'source-file-status' : undefined}
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setOver(true)
        }}
        onDragLeave={(e) => {
          if (e.relatedTarget === null) setOver(false)
        }}
        onDrop={handleDrop}
        onClick={choose}
        onKeyDown={(e) => {
          // Prevent Space from scrolling while it activates the drop zone.
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            choose()
          }
        }}
        class={[
          'flex h-full flex-col rounded-xl border-2 border-dashed bg-surface p-4',
          'outline-none transition-colors duration-150 ease-signal',
          'focus-visible:border-cyan focus-visible:ring-3 focus-visible:ring-cyan/30',
          over
            ? 'border-cyan bg-cyan/7'
            : busy
              ? 'border-line-strong'
              : 'border-line-strong hover:border-cyan',
          busy ? 'cursor-wait opacity-70' : 'cursor-pointer',
        ].join(' ')}
      >
        <div class="mb-3 flex items-center justify-between gap-2.5">
          <span class="truncate font-mono font-semibold text-ink">
            {loaded ? filename : 'Drop your logo here'}
          </span>
          <span class="shrink-0 rounded-full bg-cyan/12 px-2 py-0.5 text-xs font-bold tracking-widest text-cyan uppercase">
            SVG
          </span>
        </div>

        <div class="signal-grid grid min-h-40 grow place-items-center rounded-lg bg-bg p-4">
          {sourceSvg !== null && !busy ? (
            <img
              src={sourceUri(sourceSvg)}
              alt={`${filename ?? 'The logo'}, as supplied`}
              class="max-h-40 w-auto max-w-full object-contain"
            />
          ) : (
            <p class="max-w-[38ch] text-center">
              <span class="block font-semibold text-ink">
                {busy
                  ? 'Rendering…'
                  : rejected
                    ? "That file isn't an SVG"
                    : 'Drop or click to choose'}
              </span>
              <span class="mt-1.5 block text-sm text-muted">
                {rejected
                  ? 'Manifesto needs an SVG. Export your logo as SVG and try again.'
                  : `Creates ${ICON_FILENAMES.length} icon files, a web app manifest, and ${HEAD_SNIPPET_TAG_COUNT} tags for your site's <head>.`}
              </span>
            </p>
          )}
        </div>

        {loaded && (
          <Caption class="mt-2.5 block text-dim">Drop another SVG or click to replace</Caption>
        )}
      </div>
      <span id="source-file-status" class="sr-only" role="status" aria-live="polite">
        {rejected ? "That file isn't an SVG. Export your logo as SVG and try again." : ''}
      </span>
    </>
  )
}
