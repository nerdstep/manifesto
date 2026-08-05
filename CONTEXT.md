# Manifesto

A desktop app that turns a single source mark into the complete set of icon assets a
website needs, plus the markup and manifest that reference them.

## Language

**Source Mark**:
The SVG a user supplies as input. The one thing the user brings; everything else is
derived from it.
_Avoid_: logo, image, input file, source image

**Dark Mark**:
An optional second SVG for dark surfaces. Supplied by the user, or derived by
recoloring when the Source Mark is monochrome. Used in two places: the dark half of
`favicon.svg`, and as the composed mark in any Rendition whose Icon Background is dark.
_Avoid_: dark logo, inverted mark, dark variant

**Asset Bundle**:
The complete set of derived files produced from one Source Mark — the icons, the
Web App Manifest, and the Head Snippet. The unit the user copies into their site.
_Avoid_: output, results, favicon pack, export

**Asset Bundle Session**:
The span of work on one Source Mark, beginning when it is opened and ending when another
Source Mark replaces it. Edits and generation attempts during that span belong together.
_Avoid_: browser session, app session, document session

**Rendition**:
One derived image file within an Asset Bundle, at a specific size and with a specific
treatment applied. `apple-touch-icon.png` and `icon-512.png` are two Renditions of the
same Source Mark.
_Avoid_: variant, size, output image, icon

**Bundle Name**:
The filesystem slug naming an Asset Bundle's folder. Seeded from the Source Mark's
filename and edited directly; deliberately independent of the Web App Manifest's
`name` and `short_name`, which are display strings with different constraints.
_Avoid_: folder name, project name, short_name

**Output Root**:
The single directory under which every Asset Bundle is written, as
`<Output Root>/<Bundle Name>/`. Configured once, remembered across launches.
_Avoid_: destination, save location, export path

**Inference**:
The app's opening guess at every setting a Source Mark cannot state for itself — the
manifest names from the filename, and Theme Color, Icon Background and Splash Background
from the mark's own pixels. Inferred values are ordinary editable values, indistinguishable
on screen from typed ones. A Sidecar for the same Source Mark always wins over Inference.
_Avoid_: defaults, auto-detect, smart defaults, guess

**Sidecar**:
The `manifesto.json` written inside an Asset Bundle recording the settings and Source
Mark hash that produced it. Makes a Bundle self-describing and lets a re-drop restore
prior choices rather than re-infer them.
_Avoid_: config, settings file, metadata

**Head Snippet**:
The block of HTML `<link>` tags that reference the Asset Bundle, for pasting into a
site's `<head>`.
_Avoid_: HTML, tags, code snippet

**Web App Manifest**:
The `site.webmanifest` JSON file within an Asset Bundle. Always written in full;
never abbreviated to "the manifest" where it could be confused with the app's own name.
_Avoid_: manifest.json, the manifest

## Producing a Rendition

**Normalization**:
Reducing a Source Mark to a canonical square starting point: trim to the mark's
painted bounding box, discard the exported whitespace, scale to fit. Every Rendition
is composed from the Normalized mark, so padding percentages mean the same thing
regardless of how the SVG was exported.
_Avoid_: cropping, fitting, trimming (on their own)

**Treatment**:
The background and padding rule applied to a Normalized mark for one specific
Rendition. Some Treatments are forced by platform behavior (apple-touch must be
opaque; maskable must respect the Safe Zone); others are the app's choice.

**Safe Zone**:
The centered circle, 80% of the icon's width in diameter, that a maskable icon is
guaranteed to show. Everything outside it may be masked away by the OS.

**Icon Background**:
The opaque fill composed behind the mark in Renditions that cannot be transparent
(`apple-touch-icon.png`, `icon-maskable-512.png`). A rasterization input — it changes
pixels. Chosen for contrast against the mark, not sampled from it.
_Avoid_: background color, background_color, bg

**Splash Background**:
The Web App Manifest's `background_color` — what the OS paints while an installed PWA
boots. Metadata only; never appears in any Rendition. Distinct from Icon Background.
_Avoid_: background color, background_color

**Theme Color**:
The Web App Manifest's `theme_color` — tints Android Chrome's address bar and the PWA
title bar. Metadata only; never appears in any Rendition.
_Avoid_: brand color, accent, primary color

**Wordmark Warning**:
The advisory raised when a Normalized mark's aspect ratio exceeds ~2:1 — a horizontal
logo squeezed into a square Rendition is illegible at small sizes. Advisory only;
never blocks generation.

**Vector-space composition**:
The rule that all Treatments are applied by synthesizing a wrapper SVG around the
Source Mark and rasterizing that at each target size — never by downsampling a master
raster. Renditions are always rendered directly from vector at final dimensions.

## Scope boundaries

**Modern Minimal Set**:
The chosen contents of an Asset Bundle: `favicon.ico`, `favicon.svg`,
`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
`site.webmanifest`, and the Head Snippet. Deliberately excludes platform-legacy files
(`mstile-*`, `browserconfig.xml`, the pre-iOS-8 apple-touch ladder, the android-chrome
density ladder).

**Share Card**:
A per-page Open Graph image. Explicitly out of scope — a Share Card is authored per
page and requires text layout, whereas an Asset Bundle is authored once per site.
_Avoid_: og image, social image (when discussing scope)
