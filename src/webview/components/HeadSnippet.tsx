import { Fragment } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

import { HEAD_SNIPPET, HEAD_SNIPPET_TAGS } from '../../shared/bundle.ts'
import { bun } from '../rpc.ts'
import { Button, SectionHeading } from './ui.tsx'

export function HeadSnippet() {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (resetTimer.current !== null) clearTimeout(resetTimer.current)
    },
    [],
  )

  async function copy() {
    await bun().request.copyToClipboard({ text: HEAD_SNIPPET })
    setCopied(true)
    if (resetTimer.current !== null) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => {
      setCopied(false)
      resetTimer.current = null
    }, 1600)
  }

  return (
    <section>
      <SectionHeading
        tone="downstream"
        note="Paste these tags into your site's <head>. Manifesto does not edit your HTML."
        meta={
          <Button
            aria-label="Copy the head tags to the clipboard"
            onClick={() => {
              void copy()
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        }
      >
        Paste into &lt;head&gt;
      </SectionHeading>
      <pre class="text-code overflow-x-auto rounded-xl border border-line bg-surface p-3.5 font-mono text-muted">
        <code>
          {HEAD_SNIPPET_TAGS.map(({ name, attributes }, tagIndex) => (
            <Fragment key={`${name}-${tagIndex}`}>
              {'<'}
              <span class="text-blue">{name}</span>
              {attributes.map(([attribute, value]) => (
                <Fragment key={attribute}>
                  {` ${attribute}=`}
                  <span class="text-amber">{`"${value}"`}</span>
                </Fragment>
              ))}
              {'>'}
              {tagIndex < HEAD_SNIPPET_TAGS.length - 1 ? '\n' : null}
            </Fragment>
          ))}
        </code>
      </pre>
    </section>
  )
}
