# Fixtures

Every fixture paints the same **staircase mark** unless stated otherwise:

```txt
M0 0 H40 V20 H20 V40 H60 V60 H0 Z
```

in a 60×60 space. It is deliberately **asymmetric on both axes**, so a centering,
mirroring or transposition bug is visible rather than hidden by symmetry — which is what
a circle or square would do.

| Fixture | Exercises |
| --- | --- |
| `square-tight.svg` | Baseline: viewBox exactly bounds the painted mark |
| `square-padded.svg` | Same mark, 1000×1000 canvas, painted extents `320,320 360×360`. **Must normalize identically to `square-tight`.** |
| `invisible-frame-none.svg` | `square-padded` + full-canvas `<rect fill="none">` |
| `invisible-frame-opacity.svg` | `square-padded` + full-canvas `<rect opacity="0">` |
| `invisible-frame-transparent.svg` | `square-padded` + full-canvas `<rect fill="transparent">` |
| `wordmark.svg` | 1000×300 painted extents → **Wordmark Warning** |
| `monochrome.svg` | Two shapes, one paint colour → Dark Mark auto-derive eligible |
| `multicolor.svg` | Two shapes, different colours → **not** eligible |
| `no-viewbox.svg` | `width`/`height` only, no viewBox |
| `light-mark.svg` | Near-white paint → must select a **dark** Icon Background |
| `with-text.svg` | Only `<text>` — paints nothing without fonts → `EmptyMarkError` |
| `with-script.svg` | `<script>` + `on*` attribute → both stripped |
| `external-image.svg` | Remote `<image href>` covering the canvas → advisory, never fetched, and **must not inflate painted extents** |
| `empty.svg` | Valid SVG painting nothing → `EmptyMarkError` |

## The three `invisible-frame-*` fixtures are the important ones

They are the regression guard for the Phase 0 amendment. `getBBox()` reports
`0 0 1000x1000` for all three — the full canvas — because it measures the **layout** box.
The mark then renders at 13.4% of a Rendition instead of 80.6%.

This is what a real Figma or Illustrator export looks like: those tools add a
transparent or `fill="none"` rect to lock the export frame. Normalization must find the
painted extents by scanning the alpha channel, and these three fixtures must produce the
same Renditions as `square-tight` and `square-padded`.

See `docs/phase-0-findings.md`.
