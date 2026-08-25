/** Decide whether a Source Mark can be recolored, and with what (ADR 0003). */

import type { Pipeline } from '../pipeline/index.ts'
import type { AssetBundleSessionDesired } from '../shared/rpc.ts'

/** Recompute only when the marks change: eligibility parses the SVG. */
export function withColorPairSeed(
  pipeline: Pipeline,
  previous: AssetBundleSessionDesired | null,
  next: AssetBundleSessionDesired,
): AssetBundleSessionDesired {
  const same =
    previous !== null && previous.sourceSvg === next.sourceSvg && previous.darkSvg === next.darkSvg

  return {
    ...next,
    colorPairSeed: same
      ? previous.colorPairSeed
      : pipeline.colorPairSeed(next.sourceSvg, next.darkSvg),
  }
}
