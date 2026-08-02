/**
 * Everything downstream of a successful generation, in the order it is useful.
 *
 * Advisories first, because they change what you do next. Then the previews, then the
 * file list, then the one part of the last mile that stays manual.
 *
 * Grouped as a component rather than inlined in `App.tsx` because these four always
 * appear together and always take the same Bundle — `App` composes the *session*, this
 * composes the *output*.
 */

import { HEAD_SNIPPET } from '../../shared/bundle.ts'
import type { BundleWire } from '../../shared/rpc.ts'
import { Advisories } from './Advisories.tsx'
import { BundleFiles } from './BundleFiles.tsx'
import { HeadSnippet } from './HeadSnippet.tsx'
import { Previews } from './Previews.tsx'

export function Results({ bundle }: { bundle: BundleWire }) {
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
      <Previews
        files={bundle.files}
        name={bundle.settings.name}
        shortName={bundle.settings.shortName}
        themeColor={bundle.settings.themeColor}
        splashBackground={bundle.settings.splashBackground}
      />
      <BundleFiles files={bundle.files} />
      <HeadSnippet snippet={HEAD_SNIPPET} />
    </>
  )
}
