import type { BundleWire } from '../../shared/rpc.ts'
import { Advisories } from './Advisories.tsx'
import { Previews } from './Previews.tsx'
import { SectionHeading } from './ui.tsx'

export function InContext({ bundle }: { bundle: BundleWire }) {
  return (
    <>
      {/* Pixel drift is shown beside the optimization toggle. */}
      <Advisories
        advisories={bundle.advisories.filter((advisory) => advisory.kind !== 'svgo-pixel-drift')}
      />

      <SectionHeading meta="true size" tone="upstream">
        In context
      </SectionHeading>
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
