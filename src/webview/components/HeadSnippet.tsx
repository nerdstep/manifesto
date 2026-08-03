import { useEffect, useRef, useState } from 'preact/hooks'

import { bun } from '../rpc.ts'
import { Button } from './ui.tsx'

/**
 * The one part of the last mile that stays manual.
 *
 * The `<link>` tags cannot be written to disk usefully — they go inside an existing
 * `<head>`. The app deliberately never parses or rewrites the user's HTML.
 */
export function HeadSnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (resetTimer.current !== null) clearTimeout(resetTimer.current)
    },
    [],
  )

  async function copy() {
    await bun().request.copyToClipboard({ text: snippet })
    setCopied(true)
    if (resetTimer.current !== null) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => {
      setCopied(false)
      resetTimer.current = null
    }, 1600)
  }

  // The heading is `Results`', so that every downstream section is titled the same way.
  return (
    <section>
      <div class="mb-2 flex items-start justify-between gap-3">
        <p class="text-[11px] text-dim">
          Paste these tags into your site's &lt;head&gt;. Manifesto does not edit your HTML.
        </p>
        <Button
          aria-label="Copy the head tags to the clipboard"
          onClick={() => {
            void copy()
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre class="overflow-x-auto rounded-xl border border-line bg-surface p-3.5 font-mono text-xs text-muted">
        {snippet}
      </pre>
    </section>
  )
}
