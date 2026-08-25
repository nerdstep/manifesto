# Color Pair recolors a monochrome Source Mark

When a Source Mark paints every element in one color, Manifesto offers a Color Pair:
two colors that produce a Derived Mark per color scheme, the mark painted in one
and the surface in the other. Recolor is off until the user turns it on, and is
unavailable to any mark using more than one paint or `currentColor`.

## Considered Options

- Require a second SVG for every dark-surface case (today's behaviour).
- Recolor any Source Mark, flattening multicolor marks to a silhouette.
- Recolor only monochrome marks, gated behind an explicit opt-in.

## Consequences

Recolor rewrites paint values into a new SVG string before validation and
optimization, so a Derived Mark reaches `normalize` on the same path as a supplied
one. An element with no `fill` inherits SVG's black default and is rewritten too;
`none` is left alone, as are `fill-opacity` and `stroke-opacity`.

A supplied Dark Mark disables recolor and says so. Clearing it re-enables recolor.
Supplied always beats derived, matching Sidecar-over-Inference.

No PNG format and no Web App Manifest field selects an icon by color scheme, so the
Primary Scheme decides for every raster at once. When recolor is active, `favicon.ico`,
`icon-192.png`, and `icon-512.png` stop being transparent: a mark painted to suit one
surface is illegible on any other. Golden hashes change for recolored Bundles only.

The Color Pair sets Icon Background rather than competing with it. `Treatment`,
`markFor`, and every existing rendition path are unchanged.

Inference seeds the pair from the mark's own paint and white, so switching recolor on
changes nothing on screen until the user edits a color.

`sourceHash` continues to hash the original Source Mark. The Color Pair and Primary
Scheme are settings, recorded in the Sidecar; a color tweak must not make the same
logo look like a different one.
