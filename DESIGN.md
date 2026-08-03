---
name: Manifesto
description: From one SVG to every web asset.
colors:
  bg: "#04070e"
  surface: "#111c30"
  raised: "#1b2740"
  line: "#243350"
  line-strong: "#33456a"
  ink: "#f5f6f7"
  muted: "#93a4c2"
  dim: "#8494b4"
  cyan: "#1bd6fd"
  blue: "#4da3ff"
  amber: "#ffc712"
  ok: "#4ade80"
  bad: "#ff6b6b"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.14em"
  caption:
    fontFamily: "ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.1em"
  code:
    fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  control: "8px"
  card: "12px"
  pill: "999px"
spacing:
  tight: "8px"
  gap: "12px"
  tile: "14px"
  card: "16px"
  panel: "18px"
  flow: "20px"
  page: "28px"
components:
  source-pane:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  pipeline-step:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.dim}"
    typography: "{typography.caption}"
    rounded: "{rounded.control}"
    padding: "12px 6px"
  pipeline-step-active:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.cyan}"
  tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.tile}"
  well:
    backgroundColor: "{colors.bg}"
    rounded: "{rounded.control}"
    padding: "14px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
  button:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  mask-pill:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    rounded: "{rounded.pill}"
    padding: "4px 8px"
  mask-pill-selected:
    textColor: "{colors.cyan}"
  terminal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.card}"
    padding: "13px 16px"
---

<!--
  markdownlint-disable MD024 MD025 MD026 MD036

  Four rules are switched off for this file only, and none of them because the warning is
  inconvenient:

  - MD024 (duplicate headings) — `### Named Rules` repeats once per section by design.
  - MD026 (trailing punctuation) — `### Do:` / `### Don't:` are spec-mandated verbatim.
  - MD036 (emphasis as heading) — the `**Creative North Star**` line likewise.
  - MD025 (multiple H1) — a false positive: there is exactly one `#` in the file. The
    linter reads the YAML frontmatter's closing `---` as a setext underline.

  The DESIGN.md format spec requires these headers character-for-character so the file
  stays parseable by DESIGN.md-aware tooling. Where the spec and the linter disagree, the
  spec wins.
-->

# Design System: Manifesto

## 1. Overview

**Creative North Star: "The Signal Path"**

One file enters at the left. It passes through named stages — parse, normalize, resize,
optimize, export — and fans out to every platform that needed it. That is the product in
one sentence, and it is the shape of the interface: source on the left, transformation
across the middle, artefacts on the right.

Direction is the organising idea, so **colour encodes direction**. Cyan is upstream: the
source mark, the running stage, focus, anything you are still deciding. Amber is
downstream: what has landed on disk, and where. A glance at which accent dominates a region
tells you which side of the render seam you are looking at, before you have read a word.

The surface is near-black with a blue cast, lifted just off true black. It is not "dark
mode" as a preference — it is the ground the signal reads against. Cyan and amber only
behave as signal because almost nothing else on screen is saturated; on a light ground the
same two colours become decoration, which is why this system is specified dark-first and
why the near-black is load-bearing rather than a taste.

What this rejects: the tool that performs competence. No hero metric, no gradient text, no
oversized headline announcing what the app does. The app is opened, used for ninety seconds
and closed. Confidence comes from accuracy — the ring drawn at the true Safe Zone diameter,
the byte delta, the path the files went to — never from tone.

**Key Characteristics:**

- **Directional colour.** Cyan upstream, amber downstream. No third meaning.
- **Near-black ground**, blue-cast, lifted off `#000000` so white text does not halate.
- **Bordered planes, no shadows.** Depth is three surfaces and a hairline.
- **True size by default.** Nothing is scaled up to look impressive.
- **Glow is state.** It appears on the running stage and on focus, nowhere else.
- **Dark-first**, and a light counterpart is not specified — see The Ground Rule.

## 2. Colors

Sampled from `hero.png` with a PNG decoder rather than picked by eye, then adapted for a
surface that gets stared at instead of glanced at.

### Primary

- **Signal Cyan** (`#1bd6fd`): the dominant saturated colour in the brand asset, and the
  upstream half of the system. The source pane's active border, the running pipeline stage,
  every focus ring, the Safe Zone ring, a selected mask. If it is cyan, it is either the
  input or the thing currently happening to it.

### Secondary

- **Landed Amber** (`#ffc712`): sampled from the connector cores that fan out of the export
  stage. The downstream half — the output section heading, the terminal prompt, the path
  something was written to. Amber means *this exists on disk now*.

### Tertiary

- **Deep Blue** (`#4da3ff`): the tagline and syntax-highlighted tag names. Lifted from the
  asset's `#0089ff`, which sits at 3.9:1 on the ground and would have failed as body text.
- **Confirmed Green** (`#4ade80`): a write succeeded.
- **Refusal Red** (`#ff6b6b`): generation failed, or nothing was written.

### Neutral

- **Ground** (`#04070e`): the page, and the inside of every preview well. The asset's page
  is `#000611` — near-perfect black. This is lifted deliberately; see The Ground Rule.
- **Surface** (`#111c30`): panels, tiles, the source pane, the terminal.
- **Raised** (`#1b2740`): inputs and buttons — the things you can put a cursor in.
- **Line** (`#243350`) and **Line Strong** (`#33456a`): every border, always 1px, except the
  source pane's 2px dashed.
- **Ink** (`#f5f6f7`): sampled exactly off the wordmark. All primary text.
- **Muted** (`#93a4c2`) and **Dim** (`#8494b4`): labels, captions, secondary readouts.

### Named Rules

**The Direction Rule.** Cyan is upstream, amber is downstream, and neither is ever used for
emphasis. If you want something to stand out and it is not "this is the input" or "this is
on disk", use weight, size, or position. A third accent role would destroy the only thing
this palette actually tells you.

**The Ground Rule.** The base is `#04070e`, not the asset's `#000611`. A poster is looked at
once; an app is stared at, and white text on true black halates and smears in the eye. The
blue cast is kept so it still reads as the same surface. Never darken the ground to match
the poster exactly, and never neutralise the blue out of it.

**The 4.87 Rule.** Every text token clears WCAG AA against all three planes. The tightest
pair is Dim on Raised at **4.87:1**, and Dim is used at 10px. Measured, not assumed: Ink
13.76, Muted 5.90, Cyan 8.56, Amber 9.52 at their worst. Any new colour must be measured
against `--raised` before it ships, because that is always the worst case.

**The Signal Scarcity Rule.** Saturated colour covers well under a tenth of the screen. The
moment cyan or amber is used to make a panel look interesting, every other cyan and amber on
screen stops meaning anything.

## 3. Typography

**Display Font:** `ui-sans-serif, system-ui, 'Segoe UI', sans-serif` at weight 800
**Body Font:** the same family at 400/600
**Label/Mono Font:** `ui-monospace, 'Cascadia Code', Consolas, monospace`

**Character:** one family across the whole interface, carried by weight rather than by
pairing. The wordmark is the only place it is allowed to be loud: lowercase, 800, tightened
to `-0.03em`. Everything below it is small, because everything below it is instrumentation.

The monospace face is not styling. It marks a string as *literal* — a path, a filename, a
hex value, a pixel dimension, the head snippet — something you could copy, type, or find on
disk.

### Hierarchy

- **Display** (800, 30px, `-0.03em`): the wordmark. One per screen. Solid fill, never a
  gradient.
- **Title** (600, 13px): the source filename, and any line that names the thing you are
  looking at.
- **Body** (400, 13px, 1.5): controls, hints, prose. The default.
- **Label** (700, 11px, `0.14em`, uppercase): section headings. Cyan upstream, amber
  downstream.
- **Caption** (700, 10px, `0.1em`, uppercase, Muted): specimen captions on output tiles,
  paired with a monospace dimension.
- **Code** (400, 12px, monospace): terminal line, paths, snippet, dimensions.

### Named Rules

**The One Loud Thing Rule.** The wordmark is the only type above 13px. There is no headline
role and no subhead role. If a region seems to need a bigger heading, it more likely needs
to be shorter.

**The Specimen Caption Rule.** Every output tile is captioned with its name and its exact
dimensions, in that order, at 10px — `BROWSER TAB · 16×16`. The dimension is monospace
because it is a fact about the file. This is a caption on an artefact, not a section
eyebrow, and it is the only place uppercase micro-type is paired with a number.

**The Literal Rule.** Monospace marks a string the user could act on. Never use it for
emphasis, and never for numbers that are merely numeric.

## 4. Elevation

**No shadows.** Depth is three flat planes — Ground, Surface, Raised — each separated by a
1px border. The planes are close in luminance by design (1.18 and 1.15 apart); on a
near-black ground the border does the separating, exactly as the brand asset does with its
thin-bordered tiles.

The one `box-shadow` in the system is not elevation. It is the focus ring, and the glow on
the running pipeline stage.

### Shadow Vocabulary

- **Focus ring** (`box-shadow: 0 0 0 3px color-mix(in srgb, var(--cyan) 30%, transparent)`):
  on `:focus-visible` only, so keyboard users get it and mouse users see nothing change.
- **Active stage** (`box-shadow: 0 0 0 1px color-mix(in srgb, var(--cyan) 40%, transparent)`):
  the pipeline stage currently running. Tight, not soft — a rim, not a halo.

### Named Rules

**The Glow-Is-State Rule.** The brand asset glows everywhere because it is a poster. Here,
a glow means one of exactly two things: this control has keyboard focus, or this stage is
running right now. A glow used to make something look premium is forbidden.

**The Three-Plane Rule.** Ground, Surface, Raised. A fourth level, or a card inside a card,
means the layout is wrong. Group related controls by spacing and a shared label instead.

**The Simulation Exception.** A preview may use whatever it needs to look like the platform
it depicts — iOS corner radii, a launcher mask, Chrome's `#292a2d` tab chrome, a drop shadow
under a home-screen icon. Those pixels are content, not interface, and must never leak
outward into the app's own surfaces.

## 5. Components

### Source Pane

The entry point, and the only element with a dashed border (2px) — the one place the system
says *put something here*. Surface background, a measured grid inside the well, the filename
and an `SVG` pill above, a syntax-highlighted peek below.

- **Resting:** Line Strong dashed border, Muted text.
- **Hover / drag-over:** Signal Cyan border, 7% cyan fill.
- **Focus:** cyan border plus the focus ring, `:focus-visible` only.
- It carries `role="button"` and `tabIndex={0}` and opens the native picker on Enter, Space
  or click. A drop needs a pointer, so this is the only keyboard route into the app.

### Pipeline Strip

The signature component. Five stages — Parse, Normalize, Resize, Optimize, Export — as
bordered tiles with a 20px line icon and a 9px uppercase caption, joined by thin arrows, over
a 2px progress line that runs cyan → amber left to right.

- **Idle:** Dim on Ground, Line border.
- **Active:** Signal Cyan, cyan border, 1px cyan rim. One at a time.
- **Done:** Muted, Line Strong border.
- Ordering is information here, which is what earns the sequence. Do not reuse this pattern
  for anything that is not genuinely ordered.

### Output Tiles

A Surface card holding a Ground-coloured **well**, the platform mock at true size, and a
specimen caption. The maskable tile adds pill toggles under the well.

- **Corner style:** 12px card, 8px well.
- **Border:** 1px Line; Line Strong on hover. No shadow, ever.
- **Grid:** `repeat(auto-fit, minmax(240px, 1fr))` — no breakpoints needed. Four tiles at
  the design width; three, two and one as it narrows.
- Contents render the bytes the pipeline produced, never a re-render of the source SVG.
- Controls go **below** the well, never beside it. Beside a 128px artefact they compete for
  the tile's width, so the icon drifts off centre at every column count.

**The Two-Ring Rule.** The Safe Zone overlay is a solid near-black ring under a dashed
Signal Cyan one, 2px each. It is drawn over artwork of unknown colour, on an Icon
Background inference sets to either `#FFFFFF` or `#111111`, and no single accent survives
both — cyan measures 1.74:1 on white, amber 1.56. The dashes let the backing through, so
the near-black carries it on a light icon (8.5:1) and the cyan on a dark one (10.9:1). Any
future overlay drawn on top of user artwork needs the same treatment.

### Inputs / Fields

- Raised background, 1px Line, 8px radius, `7px 10px`, Ink at 13px.
- **Focus:** border → Signal Cyan. No glow, no size change.
- Colour fields pair a native swatch with a monospace hex input; either edits the other.
- Labels are Caption type, above the field, never a placeholder standing in for a label.

### Pill Toggles

Used for the launcher-mask picker. Transparent, 1px Line, pill radius, 10px text.
Unselected is Dim; selected is Signal Cyan text and border. `aria-pressed` carries the state.

### Terminal Line

The status readout, and the app's only confirmation that anything reached disk. Surface
card, monospace, an amber `›` prompt, the command in Ink, a Line Strong divider, the result
in Confirmed Green, and the destination path in Muted pushed to the right.

It is a `role="status" aria-live="polite"` region — polite because it updates on every
debounced edit, and interrupting someone mid-word to say "saved" is worse than telling them
a moment later.

## 6. Do's and Don'ts

### Do:

- **Do** use cyan for upstream and amber for downstream. Those are the only two meanings.
- **Do** measure any new colour against `--raised` (`#1b2740`), which is always the worst
  case, and keep it at or above 4.5:1.
- **Do** keep every border 1px, except the source pane's 2px dashed.
- **Do** render previews from the bytes on disk, at or below the size the platform uses.
- **Do** caption every output tile with its name and exact dimensions.
- **Do** put focus rings on `:focus-visible` so keyboard users get them and mouse users see
  no change.
- **Do** give every animation a `prefers-reduced-motion` path that keeps the *outcome* and
  drops the choreography. The pipeline still has to report that it finished.

### Don't:

- **Don't** add a third accent role. Cyan and amber mean direction; a third colour deletes
  the meaning of the first two.
- **Don't** use glow, blur, or `backdrop-filter` decoratively. Glow is focus or a running
  stage, and nothing else.
- **Don't** drop the ground to `#000000` to match the poster. See The Ground Rule.
- **Don't** add a shadow to any surface, or a fourth plane, or a card inside a card.
- **Don't** introduce a type role between 13px and the 30px wordmark.
- **Don't** use `background-clip: text` with a gradient. The poster's wordmark has a
  gradient; at UI sizes it becomes mud. Solid Ink.
- **Don't** use a `border-left` or `border-right` above 1px as a coloured accent.
- **Don't** put a decorative grid behind a surface. The grid under the source mark is
  depicting a vector-editor canvas, which is the only justification available.
- **Don't** write **marketing-speak** into the interface — "Effortlessly generate stunning
  icons!" No exclamation marks, no adjectives doing work that facts should do.
- **Don't** write **enterprise / compliance tone** — "The operation could not be completed."
  Passive voice with no cause, no next step, nobody accountable.
- **Don't** write **over-friendly / cutesy** copy — "Oops! Something went wrong 😅". No
  emoji, no apologies, no jokes where an explanation belongs.
- **Don't** let **raw developer output** reach the screen — "EmptyMarkError: alpha scan
  returned null". Library names, internal type names and stack-trace vocabulary stop at
  `src/host/failures.ts`.
- **Don't** add a component dependency to the view bundle. `react-aria-components` measures
  +170 kB against a 38 kB budget; the source pane is `role="button"` and 40 lines instead.
- **Don't** scale a preview up to make it look impressive. If it is small on screen, that is
  the point.
