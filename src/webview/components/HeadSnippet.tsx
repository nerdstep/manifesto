import { useEffect, useRef, useState } from 'preact/hooks'

import { bun } from '../rpc.ts'
import { Button } from './ui.tsx'

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
