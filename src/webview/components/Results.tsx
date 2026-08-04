import { HEAD_SNIPPET } from '../../shared/bundle.ts'
import type { BundleWire } from '../../shared/rpc.ts'
import { Advisories } from './Advisories.tsx'
import { HeadSnippet } from './HeadSnippet.tsx'
import { Previews } from './Previews.tsx'
import { SectionLabel } from './ui.tsx'

function Heading({ children, count }: { children: string; count?: string }) {
  return (
    <div class="mt-6 mb-2 flex items-baseline justify-between gap-3">
      <SectionLabel tone="downstream">{children}</SectionLabel>
      {count !== undefined && <span class="font-mono text-[11px] text-dim">{count}</span>}
    </div>
  )
}

export function InContext({ bundle }: { bundle: BundleWire }) {
  return (
    <>
      {/* Pixel drift is shown beside the optimization toggle. */}
      <Advisories
        advisories={bundle.advisories.filter((advisory) => advisory.kind !== 'svgo-pixel-drift')}
      />

      <Heading count="true size">In context</Heading>
      <Previews
        files={bundle.files}
        name={bundle.settings.name}
        shortName={bundle.settings.shortName}
        themeColor={bundle.settings.themeColor}
        splashBackground={bundle.settings.splashBackground}
      />
    </>
  )
}

export function OnDisk() {
  return (
    <>
      <Heading>Paste into &lt;head&gt;</Heading>
      <HeadSnippet snippet={HEAD_SNIPPET} />
    </>
  )
}
