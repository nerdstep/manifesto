import { useState } from 'preact/hooks'

import { bun } from '../rpc.ts'

/**
 * The one part of the last mile that stays manual.
 *
 * The `<link>` tags cannot be written to disk usefully — they go inside an existing
 * `<head>`. The app deliberately never parses or rewrites the user's HTML.
 */
export function HeadSnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await bun().request.copyToClipboard({ text: snippet })
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
    }, 1600)
  }

  return (
    <section class="mt-5">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-xs font-semibold tracking-[0.12em] text-muted uppercase">
          Paste into &lt;head&gt;
        </h2>
        <button
          type="button"
          class="rounded-lg border border-line bg-panel px-3 py-1.5 text-[13px] hover:border-muted"
          aria-label="Copy the head tags to the clipboard"
          onClick={() => {
            void copy()
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p class="mb-2 text-[11px] text-muted">
        These four tags point at the files above. Manifesto never edits your HTML, so this is the
        one step it cannot do for you.
      </p>
      <pre class="overflow-x-auto rounded-xl border border-line bg-panel p-3.5 text-xs">
        {snippet}
      </pre>
    </section>
  )
}
