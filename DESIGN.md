---
name: Manifesto
description: Drop an SVG, get every icon asset a website needs.
colors:
  ink: "#1c1917"
  muted: "#78716c"
  bg: "#fafaf9"
  panel: "#ffffff"
  line: "#e7e5e4"
  accent: "#2e5bff"
  ok: "#047857"
  warn: "#b45309"
  bad: "#dc2626"
typography:
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
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.08em"
  note:
    fontFamily: "ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  code:
    fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "8px"
  md: "12px"
  full: "9999px"
spacing:
  tight: "10px"
  panel: "14px"
  group: "16px"
  section: "20px"
  page: "28px"
components:
  button:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-hover:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "{spacing.panel}"
  drop-zone:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "52px 24px"
  advisory:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
---

# Design System: Manifesto

## 1. Overview

**Creative North Star: "The Contact Sheet"**

A photographer's contact sheet is a grid of frames printed at the size they were shot,
unretouched and unlabelled, laid out so a human eye can pick the good one. It does not
argue. It does not crop for effect. Its entire value is that what you see is what the
negative holds.

Manifesto is that sheet for icons. The interface exists to put six generated files in front
of someone at the size the platform will actually draw them — 16px in a tab, 60pt on a home
screen, 512 under a launcher mask — and then get out of the way. Every preview renders the
bytes that were just written to disk, never a recomputed approximation, because a Safe Zone
breach looks perfectly fine in a preview that recalculated it. The chrome around those
frames is deliberately almost nothing: hairline borders, one flat surface lifted off
another, type small enough to recede.

What this rejects: the tool that performs competence. No hero metric, no gradient, no
oversized headline announcing what the app does. The app is opened, used for ninety seconds
and closed; anything that asks to be admired on the way past is taking time from the task.
Confidence here comes from accuracy — the ring drawn at the true Safe Zone diameter, the
byte delta, the path the files went to — never from tone.

**Key Characteristics:**

- **No display type.** The largest text in the app is 13px. The `h1` is 12px uppercase.
- **Flat.** No shadow anywhere in the app's own chrome. Depth is two surfaces and a hairline.
- **Monochrome until something is true.** Colour appears only to report a state.
- **True size by default.** Nothing is scaled up to look impressive.
- **Dark mode is a variable swap**, not a second design.

## 2. Colors

A near-neutral stone palette carrying one saturated blue, with three status colours that
appear only when there is something to report.

### Primary

- **Signal Blue** (`#2e5bff`, dark `#7b95ff`): the only saturated colour in the interface,
  and it is never decoration. It marks focus rings, the active drag state of the drop zone,
  the checked state of a control, and the Safe Zone ring drawn over the maskable preview.
  If it is on screen, something is either focused, active, or being measured.

### Tertiary

The status trio. Each one means one thing, and none of them is used for emphasis.

- **Confirmed Green** (`#047857`, dark `#4ade80`): a write succeeded. Used on the status
  line's "Saved 7 files" and on the "No visible change" verdict after optimization.
- **Caution Amber** (`#b45309`, dark `#fbbf24`): an advisory. Something is worth knowing and
  the user decides. Never blocks.
- **Refusal Red** (`#dc2626`, dark `#f87171`): generation failed, or nothing was written.

### Neutral

- **Ink** (`#1c1917`, dark `#e7e5e4`): all primary text.
- **Muted Stone** (`#78716c`, dark `#8b93a1`): labels, notes, secondary readouts, and the
  resting state of the drop zone.
- **Panel** (`#ffffff`, dark `#191c23`): raised surfaces — every panel, group, input, button.
- **Ground** (`#fafaf9`, dark `#12141a`): the page beneath them.
- **Line** (`#e7e5e4`, dark `#2b303b`): every border in the app, always 1px.

### Named Rules

**The Reporting Rule.** Colour is never applied for emphasis, hierarchy, or decoration. A
coloured pixel in this interface means the app is reporting a fact: focused, active,
succeeded, worth checking, failed. If you want something to stand out and it is not one of
those five things, use weight or position.

**The 4.59 Rule.** Muted Stone on Ground measures 4.59:1 — it clears WCAG AA with 0.09 to
spare, and it is used at 11px. It may be darkened. It may never be lightened. Every token
pair in both themes has been measured and passes AA; that is a property to preserve, not a
coincidence to rely on.

**The One Swap Rule.** Dark mode overrides the nine `--color-*` variables and nothing else.
No component may carry a `dark:` variant. If a surface needs per-theme treatment beyond a
variable, the token set is wrong.

## 3. Typography

**Display Font:** none. Deliberately.
**Body Font:** `ui-sans-serif, system-ui, 'Segoe UI', sans-serif`
**Label/Mono Font:** `ui-monospace, 'Cascadia Code', Consolas, monospace`

**Character:** The system font at small sizes, doing an instrument's job. Nothing is set
large enough to be read from across a room, because nothing here is an announcement. The
monospace face is not styling — it appears on filenames, paths, hex values and the `<head>`
snippet, and its job is to mark a string as *literal*: something you could copy, type, or
find on disk.

### Hierarchy

- **Title** (600, 13px, 1.4): the drop zone's primary line. The largest text in the app.
- **Body** (400, 13px, 1.5): controls, advisories, table rows. The default.
- **Label** (600, 11px, 0.08em tracking, uppercase): group titles, panel titles, field
  labels. The structural layer.
- **Note** (400, 11px, 1.5, Muted Stone): the explanatory line under a label or preview.
- **Code** (400, 12px, monospace): filenames, paths, hex values, the head snippet.

### Named Rules

**The No-Display Rule.** There is no type role above 13px, and adding one is a change to the
product's posture, not a styling choice. An app used for ninety seconds does not get a hero.
If a section seems to need a bigger heading, it more likely needs to be shorter.

**The Micro-Label Rule.** Structural labels are 11px / 600 / 0.08em / uppercase / Muted
Stone — every group title, panel title and field label, without exception. Uppercase
micro-labels are load-bearing here rather than decorative: they are the only thing
separating one region from the next in a system with no shadows and no display type. Because
they are the mechanism, they must stay uniform; a second label treatment would read as a
second kind of structure.

**The Literal Rule.** Monospace marks a string the user could act on — a path, a filename, a
hex value, a folder name. Never use it for emphasis or for numbers that are merely numeric.

## 4. Elevation

**This system has no shadows.** Not "subtle shadows" — none. The app's chrome uses exactly
two surfaces (Panel above Ground) separated by a 1px Line, and that is the entire depth
vocabulary. Nothing floats, nothing lifts on hover, nothing casts.

The single `box-shadow` in the codebase is on the simulated iOS icon inside the home-screen
preview, where it is depicting iOS rather than styling Manifesto. That distinction is the
rule: shadows may appear *inside a preview* as part of the platform being simulated, and
nowhere else.

### Named Rules

**The Two-Surface Rule.** Panel on Ground, divided by a 1px Line. A third surface level, a
nested panel, or a panel inside a panel means the layout is wrong. Group related controls by
spacing and a shared label instead.

**The Simulation Exception.** A preview may use any treatment required to look like the
platform it depicts — iOS corner radii, launcher masks, a browser tab's chrome, a drop
shadow under a home-screen icon. Those pixels are content, not interface. They must never
leak outward into the app's own surfaces.

## 5. Components

Every interactive element is a rectangle with an 8px radius, a 1px Line border, and a Panel
background. The variation between them is padding and what colour their border becomes.

### Buttons

- **Shape:** gently rounded (8px), 1px Line border, Panel background.
- **Default:** Ink text at 13px, `6px 12px` padding. There is one button style; the app has
  no primary/secondary distinction because it has no competing actions on any screen.
- **Hover:** border shifts Line → Muted Stone. No fill change, no lift, no shadow.
- **Focus:** border shifts to Signal Blue plus a 2px Signal Blue ring at 40% opacity, on
  `focus-visible` only.

### Inputs / Fields

- **Style:** Panel background, 1px Line border, 8px radius, `6px 10px` padding, Ink at 13px.
- **Focus:** border → Signal Blue. No glow, no size change.
- **Colour fields** pair a native swatch with a monospace hex input; either edits the other.
- **Committed fields** (the Bundle Name) apply on blur or Enter and carry a Note explaining
  when the change lands. Escape reverts the draft.

### Panels / Containers

- **Corner Style:** 12px — one step softer than the controls inside them.
- **Background:** Panel. **Border:** 1px Line. **Shadow:** none, always.
- **Internal padding:** 14px for preview panels, 16px for settings groups.
- **Nesting:** forbidden. See The Two-Surface Rule.

### Advisories

- **Style:** tinted fill at 8% of the status colour, 1px border of the same colour at 40%,
  8px radius, Ink text at 13px. Amber for advisories, Red for failures.
- **Why not a stripe:** a 3px coloured left border is decoration glued to one edge of an
  otherwise ordinary panel. Tinting the whole surface makes the colour mean *this is a
  different kind of thing*, which is what it is.

### Drop Zone

The app's entry point and its largest element: a 12px-radius rectangle with a **2px dashed**
border — the only dashed border in the system, and the only 2px one. `52px 24px` of padding
makes it unmissable.

- **Resting:** Line border, Muted Stone text.
- **Drag over:** Signal Blue border, Signal Blue fill at 8%, Ink text.
- **Busy:** 60% opacity, label changes to "Rendering icons…".
- **Focus:** Signal Blue border and ring, `focus-visible` only.

It carries `role="button"` and `tabIndex={0}` and opens the native file picker on Enter,
Space, or click. A drop cannot be performed without a pointer, so the zone being activatable
is the *only* keyboard route into the app.

### Previews (signature component)

The reason the app exists. Each is a Panel containing a platform mock at true size, with a
Note naming the exact file and stating one platform fact. They render the base64 bytes the
pipeline produced — never a re-render of the source SVG.

- Nothing is scaled up. The browser-tab favicon is exactly 16 CSS px.
- The maskable preview overlays a dashed Signal Blue ring at the true Safe Zone diameter
  (80% of width), with a mask-shape toggle.
- Mock chrome uses hardcoded platform colours (`#292a2d` for a dark Chrome tab, and so on),
  not app tokens, because it is depicting someone else's interface.

## 6. Do's and Don'ts

### Do:

- **Do** report state with colour and nothing else. Five meanings only: focused, active,
  succeeded, worth checking, failed.
- **Do** keep every border 1px and every surface flat. Depth is Panel over Ground.
- **Do** render previews from the bytes on disk, at or below the size the platform uses.
- **Do** put structural labels in 11px / 600 / 0.08em / uppercase / Muted Stone, uniformly.
- **Do** use monospace for anything the user could copy, type, or find on disk.
- **Do** keep dark mode to the nine-variable swap.
- **Do** put focus rings on `focus-visible` so keyboard users get them and mouse users see
  no change.

### Don't:

- **Don't** use a `border-left` or `border-right` above 1px as a coloured accent. The
  advisories used to and were rewritten as tinted surfaces.
- **Don't** add a shadow to any app surface. The one in the codebase is depicting iOS.
- **Don't** introduce a type role above 13px, or a second label treatment.
- **Don't** nest a panel inside a panel.
- **Don't** lighten Muted Stone. It has 0.09 of headroom over AA at 11px.
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
  +170 kB against a 38 kB budget; the drop zone is `role="button"` and 40 lines instead.
- **Don't** scale a preview up to make it look impressive. If it is small on screen, that is
  the point.
