/**
 * The drop target.
 *
 * The `preventDefault` that stops the webview opening the file already ran inline in
 * index.html, before this bundle loaded — see the comment there. This component only
 * decides what to do with a drop that has already been intercepted.
 */

import { useState } from 'preact/hooks'

type Props = {
  onFile: (file: File) => Promise<void>
  busy: boolean
}

export function DropZone({ onFile, busy }: Props) {
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

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (e.relatedTarget === null) setOver(false)
      }}
      onDrop={handleDrop}
      // Named for screen readers, which cannot see the dashed rectangle that makes this
      // read as a target. NOT `role="button"` — there is still no keyboard path to
      // choosing a file, and claiming one would be a lie. See PRODUCT.md.
      aria-label="Drop an SVG logo here to generate icons"
      class={[
        'rounded-xl border-2 border-dashed px-6 py-13 text-center transition-colors',
        over ? 'border-accent bg-accent/8 text-ink' : 'border-line text-muted',
        busy ? 'opacity-60' : '',
      ].join(' ')}
    >
      <strong class="font-semibold text-ink">
        {busy ? 'Rendering icons…' : rejected ? "That file isn't an SVG" : 'Drop your logo here'}
      </strong>
      <small class="mt-1.5 block text-xs">
        {rejected
          ? 'Manifesto needs an SVG. Export your logo as SVG and drop it again.'
          : 'One SVG becomes seven icon files, a web app manifest, and the four <head> tags that point at them.'}
      </small>
    </div>
  )
}
