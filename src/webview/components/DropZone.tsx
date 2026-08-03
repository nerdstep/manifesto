/**
 * The source pane: the way into the app, and the upstream end of the Signal Path.
 *
 * The `preventDefault` that stops the webview opening the file already ran inline in
 * index.html, before this bundle loaded — see the comment there. This component only
 * decides what to do with a drop that has already been intercepted.
 *
 * ## Why the pane itself is the button
 *
 * A drop cannot be performed without a pointer, so for as long as dropping was the only
 * way in, the whole app was unreachable by keyboard. The obvious remedy is a "Choose a
 * file" button, but that adds a second control for the one thing this screen does, next to
 * a target the size of the screen. So the target *is* the control: `role="button"` is
 * honest here, Enter and Space activate it, and nothing was added to look at.
 *
 * The 2px dashed border is the only one in the system. It is the single place the
 * interface says *put something here*.
 */

import { useState } from 'preact/hooks'

import { HEAD_SNIPPET_TAG_COUNT, ICON_FILENAMES } from '../../shared/bundle.ts'
import { Caption } from './ui.tsx'

type Props = {
  onFile: (file: File) => Promise<void>
  /** Opens the native file picker. The keyboard and click route in. */
  onChoose: () => Promise<void>
  busy: boolean
  /** The Source Mark once one exists, so the pane shows what it is holding. */
  filename: string | null
  sourceSvg: string | null
}

/**
 * The Source Mark as an `<img>`, deliberately.
 *
 * This is the user's file exactly as authored — it has not been through `validate()`,
 * which is the stage that strips `<script>` elements and `on*` handlers, and that stage
 * runs on the Bun side. Inlining it with `dangerouslySetInnerHTML` would execute an
 * `onload` attribute if the file carried one.
 *
 * SVG inside `<img>` renders in the browser's secure static mode: no scripts, no external
 * fetches, no interaction. So the pane can show the true original rather than the
 * sanitized-and-normalized `favicon.svg`, which is the *output* and would be a small lie
 * in a pane labelled with the source filename.
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
          // The two keys a `role="button"` is required to answer to. Space is prevented
          // because its default is scrolling the page, which would fire the picker and jump
          // the view at the same time.
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
          <span class="truncate font-mono text-[13px] font-semibold text-ink">
            {loaded ? filename : 'Drop your logo here'}
          </span>
          <span class="shrink-0 rounded-full bg-cyan/12 px-2 py-0.5 text-[10px] font-bold tracking-widest text-cyan uppercase">
            SVG
          </span>
        </div>

        {/*
        A measured field. This is the one grid background in the system, and it is here
        because the pane is depicting a vector editor's canvas — a measurement surface,
        the same justification the Safe Zone ring has. See DESIGN.md.
      */}
        <div class="signal-grid grid min-h-40 grow place-items-center rounded-lg bg-bg p-4">
          {sourceSvg !== null && !busy ? (
            <img
              src={sourceUri(sourceSvg)}
              alt={`${filename ?? 'The logo'}, as supplied`}
              class="max-h-40 w-auto max-w-full object-contain"
            />
          ) : (
            <p class="max-w-[38ch] text-center">
              <span class="block text-[13px] font-semibold text-ink">
                {busy
                  ? 'Rendering…'
                  : rejected
                    ? "That file isn't an SVG"
                    : 'Drop or click to choose'}
              </span>
              <span class="mt-1.5 block text-[11px] text-muted">
                {rejected
                  ? 'Manifesto needs an SVG. Export your logo as SVG and try again.'
                  : `One SVG becomes ${ICON_FILENAMES.length} icon files, a web app manifest, and the ${HEAD_SNIPPET_TAG_COUNT} <head> tags that point at them.`}
              </span>
            </p>
          )}
        </div>

        {loaded && (
          <Caption class="mt-2.5 block text-dim">Drop another, or click to replace</Caption>
        )}
      </div>
      <span id="source-file-status" class="sr-only" role="status" aria-live="polite">
        {rejected ? "That file isn't an SVG. Export your logo as SVG and try again." : ''}
      </span>
    </>
  )
}
