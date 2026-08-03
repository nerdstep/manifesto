/**
 * Everything downstream of a successful generation, in two halves.
 *
 * They are two components rather than one because the settings panel sits *between* them:
 * you look at the icons, then reach for the controls that change them, then check what
 * landed. Previews above settings is the whole reason for the split — a panel of colour
 * fields above the thing they colour is a form, not a workbench.
 *
 * They are not one component with the panel passed as a child, because the panel must
 * survive a failed edit. `session` outlives `bundle`: if a regeneration fails, the Bundle
 * is gone but the settings that caused it are still on screen and still editable. Nesting
 * the panel here would make it vanish exactly when it is needed.
 *
 * Every heading is amber. That is the Signal Path doing its job: cyan above is what you
 * are still deciding, amber below is what already exists on disk.
 */

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

/** The icons, in the contexts that decide whether they work. Sits above the settings. */
export function InContext({ bundle }: { bundle: BundleWire }) {
  return (
    <>
      {/*
        Pixel drift is deliberately excluded: the Source Mark row already reports it,
        beside the byte delta it is a trade-off against and the toggle that turns it off.
        Repeating it here would be the same warning twice with less context.
      */}
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

/**
 * The last mile. Sits below the terminal, which now carries the file listing itself.
 *
 * Takes no Bundle: the snippet has no variable parts. It stays a component rather than
 * being inlined so the downstream sections keep one heading treatment.
 */
export function OnDisk() {
  return (
    <>
      <Heading>Paste into &lt;head&gt;</Heading>
      <HeadSnippet snippet={HEAD_SNIPPET} />
    </>
  )
}
