/**
 * The way into the app: drop a Source Mark, or press Enter to choose one.
 *
 * The `preventDefault` that stops the webview opening the file already ran inline in
 * index.html, before this bundle loaded — see the comment there. This component only
 * decides what to do with a drop that has already been intercepted.
 *
 * ## Why the zone itself is the button
 *
 * A drop cannot be performed without a pointer, so for as long as dropping was the only
 * way in, the whole app was unreachable by keyboard — no amount of labelling fixes that.
 * The obvious remedy is a "Choose a file" button, but that adds a second control for the
 * one thing this screen does, next to a target the size of the screen.
 *
 * So the target *is* the control. `role="button"` is honest now: Enter and Space activate
 * it, the same as a click, and the native picker opens. Nothing was added to look at.
 *
 * `react-aria-components` supplies exactly this (`DropZone` + `FileTrigger`) and was
 * measured at **+170 kB** even aliased through `preact/compat` — against a 38 kB bundle
 * and a 200 kB guard that has caught two silent load failures. Not worth retiring the
 * check for.
 */

import { useState } from 'preact/hooks'

import { HEAD_SNIPPET_TAG_COUNT, ICON_FILENAMES } from '../../shared/bundle.ts'

type Props = {
  onFile: (file: File) => Promise<void>
  /** Opens the native file picker. The keyboard and click route in. */
  onChoose: () => Promise<void>
  busy: boolean
}

export function DropZone({ onFile, onChoose, busy }: Props) {
  const [over, setOver] = useState(false)
  const [rejected, setRejected] = useState(false)

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    setOver(false)

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

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Drop an SVG logo here, or activate to choose one"
      aria-busy={busy}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
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
        'rounded-xl border-2 border-dashed px-6 py-13 text-center transition-colors',
        // `focus-visible`, not `focus`: keyboard users get a ring, mouse users see no
        // change at all. That is the whole cost of this feature, visually.
        'cursor-pointer outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40',
        over ? 'border-accent bg-accent/8 text-ink' : 'border-line text-muted',
        busy ? 'opacity-60' : '',
      ].join(' ')}
    >
      <strong class="font-semibold text-ink">
        {busy
          ? 'Rendering icons…'
          : rejected
            ? "That file isn't an SVG"
            : 'Drop your logo here, or click to choose one'}
      </strong>
      <small class="mt-1.5 block text-xs">
        {rejected
          ? 'Manifesto needs an SVG. Export your logo as SVG and try again.'
          : `One SVG becomes ${ICON_FILENAMES.length} icon files, a web app manifest, and the ${HEAD_SNIPPET_TAG_COUNT} <head> tags that point at them.`}
      </small>
    </div>
  )
}
