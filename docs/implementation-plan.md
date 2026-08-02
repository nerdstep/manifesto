# Manifesto — implementation plan

Handoff plan for building v1 as specified in [design-v1.md](./design-v1.md). Vocabulary is
in [CONTEXT.md](../CONTEXT.md) — use those terms in code and commits.

Note: the root `DESIGN.md` is a *visual system* spec and a different document. The v1
product decisions this plan implements are in `docs/design-v1.md`.

**Sequencing principle:** the pipeline is a pure function with no Electrobun dependency,
so phases 1–4 are built and fully tested **headlessly with `bun test`**, before a window
is ever opened. Do not build UI first. The hard, high-value correctness work
(Normalization, Safe Zone math) is invisible in a preview and only provable by test.

---

## Phase 0 — Spikes ✅ COMPLETE

All three resolved. Full results in [spike/FINDINGS.md](./spike/FINDINGS.md). Summary:

| # | Question | Outcome |
| --- | --- | --- |
| 0.1 | Does `@resvg/resvg-wasm` expose a bounding-box API? | **Yes, but do not use it.** `getBBox()` reports the *layout* box; invisible geometry inflates it. **Normalization uses an alpha scan instead.** See amendment below. |
| 0.2 | What does `ico-endec` emit? | **PNG-embedded ICO, correctly formed.** Adopted as-is, no fallback needed. |
| 0.3 | Electrobun round-trip | **Works end to end.** OS drop → `File` → `file.text()` → RPC → resvg → base64 → `<img>`, 28 ms round trip. Three footguns found, now standing constraints. |

### Amendment — Normalization must not use `getBBox()`

`getBBox()` returns the **layout** box. Six element classes inflate it while painting
nothing: unresolvable `<image>`, `fill="none"`, `opacity="0"`, `fill-opacity="0"`,
`visibility="hidden"`, `fill="transparent"`. Only `display="none"` and `<defs>` are
excluded.

This is not exotic — **Figma and Illustrator routinely emit a transparent bounding rect
to lock the export frame**, which is exactly the padded export Normalization exists to
correct. Measured damage: a mark occupying **13.4%** of a Rendition instead of **80.6%**.
Silent, no warning.

**Normalization is therefore:**

1. Render the Source Mark once at a probe resolution (1024px), scan the **alpha channel**
   for painted extents, express them in document viewport pixels. *(7.7 ms, once per
   Source Mark — not per Rendition.)*
2. No painted pixels → **hard guarded error.** This one path covers empty marks,
   text-only marks, and marks of purely invisible geometry.
3. Build a canonical `viewBox="0 0 1000 1000"` wrapper with the original `<svg>` **nested
   verbatim** (forcing only explicit `width`/`height`), plus the Treatment's background
   `<rect>` and inset transform.

Verified: this makes `square-tight` ≡ `square-padded` **byte-identical on 6 of 7
Renditions** (maskable differs by 0.037%), and puts **0.00%** of maskable painted pixels
outside the Safe Zone. The `getBBox()` approach differed by 2.73% at 16px.

**Never round-trip through `Resvg.toString()`** — its serializer emits `xlink:href`
without declaring the namespace, so its own output fails to re-parse for any mark
containing an `<image>`.

---

## Phase 1 — Skeleton and test harness ✅ COMPLETE

**Goal:** the pure pipeline's shape exists, returns empty, and is under test.
**Result:** 44 tests passing, `tsc --noEmit` clean.

```txt
manifesto/
├── CONTEXT.md
├── DESIGN.md          (visual system)
├── package.json
├── tsconfig.json
├── docs/
│   ├── phase-0-findings.md
│   └── reference/
│       └── normalization-prototype.ts   ← validated alpha-scan impl for Phase 3
├── src/
│   ├── pipeline/          ← pure. no fs, no electrobun, no rpc.
│   │   ├── index.ts       ← buildBundle, the one exported function
│   │   ├── types.ts       ← Settings, Advisory, BundleResult, EmptyMarkError
│   │   ├── renditions.ts  ← the Rendition/Treatment table + constants
│   │   ├── validate.ts    ← phase 2
│   │   ├── optimize.ts    ← phase 2
│   │   ├── normalize.ts   ← phase 3
│   │   ├── compose.ts     ← phase 3
│   │   ├── rasterize.ts   ← phase 3 (WASM init seam is real)
│   │   └── assemble.ts    ← phase 4
│   ├── bun/               ← phase 5: window, rpc, disk
│   └── webview/           ← phase 6/7: ui
└── test/
    ├── fixtures/          ← 14 fixtures + README explaining each
    ├── helpers.ts
    ├── pipeline-purity.test.ts
    ├── fixtures.test.ts
    ├── build-bundle.test.ts
    └── renditions.test.ts
```

`renditions.ts` was added beyond the original tree: the Treatment table encodes platform
requirements rather than preferences, so it earns its own module and its own tests. The
`electrobun.config.ts` arrives in Phase 5 — nothing before then needs a window.

**The one seam that matters:**

```ts
// src/pipeline/types.ts
export type Settings = {
  name: string;
  shortName: string;
  themeColor: string;        // #rrggbb
  iconBackground: string;    // #rrggbb — the only color that changes pixels
  splashBackground: string;  // #rrggbb
  optimizeSvg: boolean;
};

export type Advisory =
  | { kind: "wordmark"; aspectRatio: number }
  | { kind: "text-elements"; count: number }
  | { kind: "external-image"; hrefs: string[] }
  | { kind: "svgo-pixel-drift"; percent: number };

export type BundleResult = {
  files: Map<string, Uint8Array>;   // filename → bytes
  advisories: Advisory[];
  sourceHash: string;               // for the Sidecar collision guard
  optimizedBytes: number;
  originalBytes: number;
};

// src/pipeline/index.ts
export async function buildBundle(
  sourceSvg: string,
  darkSvg: string | null,
  settings: Settings,
): Promise<BundleResult>;
```

`buildBundle` must never import `node:fs`, `bun`, or anything under `src/bun` or
`src/webview`. Add a lint rule or a test that asserts this — it is the property the
entire test strategy rests on.

**Fixtures** (`test/fixtures/`), each a minimal hand-written SVG:

| Fixture | Exercises |
| --- | --- |
| `square-tight.svg` | Baseline: viewBox matches painted extents |
| `square-padded.svg` | Same mark on a 1024 canvas with slack — must normalize identically to `square-tight` |
| `wordmark.svg` | 1000×300 — triggers the **Wordmark Warning** |
| `monochrome.svg` | Single paint color — Dark Mark auto-derive eligibility |
| `multicolor.svg` | Several paints — must *not* offer auto-derive |
| `no-viewbox.svg` | Only width/height attributes |
| `light-mark.svg` | Near-white paint — must select a dark **Icon Background** |
| `with-text.svg` | `<text>` element — paints nothing; hard error, not an advisory |
| `with-script.svg` | `<script>` — must be stripped |
| `external-image.svg` | Remote `<image href>` — never fetched, and must not inflate extents |
| `invisible-frame-none.svg` | Mark + full-canvas `<rect fill="none">` — must normalize identically to `square-tight` |
| `invisible-frame-opacity.svg` | Mark + full-canvas `<rect opacity="0">` — same |
| `invisible-frame-transparent.svg` | Mark + full-canvas `<rect fill="transparent">` — same |
| `empty.svg` | Valid SVG that paints nothing — hard error |

The three `invisible-frame-*` fixtures are the regression guard for the Phase 0
amendment. They are what a real Figma export looks like, and they are the fixtures that
`getBBox()` fails.

**Definition of done:** ✅ `bun test` runs, all fixtures parse, `buildBundle` returns an
empty map, and the no-forbidden-imports test passes.

Two things worth knowing before Phase 2:

- The purity guard strips comments before scanning, so documentation may mention
  `node:fs` freely. It bans `node:path` too — path resolution in the pipeline is a
  reliable sign that filesystem access is about to follow.
- `buildBundle` uses `node:crypto` rather than `Bun.CryptoHasher`, so the pipeline runs
  under plain Node as well. That costs nothing and keeps the "no host environment"
  claim literally true.

---

## Phase 2 — Validate and optimize ✅ COMPLETE

64 tests passing, full `check` gate clean. Two things worth carrying forward:

**Parsing is done by SVGO's XML parser via a custom collector plugin**, not by regex.
Script removal is a correctness-critical edit to a file that gets written into someone's
web root, and `removeScripts` is already namespace-aware and already knows the full
event-attribute set (imported from `_collections`, so detection and removal cannot
drift). This needed no new dependency. Import from `svgo/browser` — the default export
is the Node build, which pulls in `fs` for config discovery.

**`removeViewBox` is not in SVGO v4's `preset-default`** (it was in v3), so it no longer
runs. Passing it as an override is *not* a defence: v4 rejects overrides for plugins
outside the preset and silently does nothing but log a warning on every call. The guard
is a test asserting `viewBox` survives. `cleanupIds` *is* still in the preset and is
overridden off.

**SVGO rewrites colour notation** — `#2E5BFF` comes back as `#2e5bff`, and may become
shorthand or a keyword. Colour inference in Phase 6 must read rendered pixels, never
markup. It already does.

### Original plan

**`validate.ts`** — parse the SVG, and:

- Count `<text>` / `<tspan>` → `text-elements` advisory. resvg renders them **blank**
  without font buffers. If text is *all* the mark contains, Normalization's
  no-painted-pixels guard turns it into a hard error, which is correct — but the
  advisory still matters for a mark that is part glyph, part text.
- Strip `<script>` elements and `on*` attributes.
- Collect `<image href>` values with a remote scheme → `external-image` advisory.
  **Reporting only.** Spike 0.1 confirmed resvg-wasm never resolves remote refs (zero
  `fetch` calls with `fetch` trapped), and the alpha scan ignores unpainted geometry, so
  no neutralizing is needed for either safety or correctness. Data URIs render normally.

**`optimize.ts`** — SVGO with a conservative preset. Return original and optimized byte
counts. Keep `cleanupIds` **off** by default; collided gradient IDs are one of SVGO's
classic breakages and the one most likely to hit real logo exports.

The pixel-diff verification belongs here but depends on `rasterize.ts` — land the byte
diff now, wire the drift check at the end of Phase 3.

**Definition of done:** advisories fire correctly for every fixture that should trigger
one and for none that shouldn't; `with-script.svg` output contains no script; optimize
is a no-op when `settings.optimizeSvg` is false.

---

## Phase 3 — Normalize, compose, rasterize ✅ COMPLETE

118 tests passing, full `check` gate clean, 84 golden hashes committed.

Two corrections came out of building it:

**The maskable Safe Zone is a CIRCLE, and `inset: 0.2` did not satisfy it.** A box of
side 0.6 has a half-diagonal of 0.424 against a safe radius of 0.4, so any mark painting
into its own bounding-box corners was clipped — measured at maxRadius 217.1 vs 204.8.
Phase 0 missed this because its fixture was a circle, which never reaches its own
corners. `Treatment.fit` is now `{ mode: 'box', inset }` or `{ mode: 'circle', diameter }`,
and maskable fits the circle using the mark's true painted radius. It is shape-aware:
the staircase shrinks 5.7% (it had to), a wordmark grows **31%** (it never needed the
box penalty). Every fixture now measures 0 pixels outside the Safe Zone.

**Byte-identity across differently-scaled exports is unattainable**, and Phase 0's claim
that it held was an artifact of that fixture's geometry landing exactly on probe-pixel
boundaries. `docs/phase-0-findings.md` now carries the correction. The DoD below was
rewritten accordingly.

Also worth knowing: `describe()` bodies run during collection, *before* `beforeAll` — so
anything calling the rasterizer at describe scope must be lazy. Golden hashes live in
`test/golden/renditions.json`; regenerate with `bun run goldens`, never to make a red
suite green.

### Phase 3 as planned

**The core of the app.** Budget the most time here.

**`normalize.ts`** — **alpha-scan** the painted extents (never `getBBox()` — see the
Phase 0 amendment), scale to fit, center. Emit the extents and the aspect ratio. Raise
the **Wordmark Warning** above ~2:1. No painted pixels → hard error.

The property that proves this works: **`square-tight.svg`, `square-padded.svg` and the
three `invisible-frame-*.svg` fixtures must all produce the same Renditions.** That
single assertion is the whole point of Normalization — identical logos exported
differently must not produce different icons. Write it first. It is already verified to
pass in spike 0.1f.

**`compose.ts`** — synthesize the wrapper SVG per Rendition. Pure string/DOM work, no
rasterization, so it is trivially unit-testable in isolation:

```ts
compose(normalizedMark, { size: 512, background: "#111111", inset: 0.20 }) // → svg string
```

Treatments, from the design-v1.md table:

| Rendition | Background | Inset |
| --- | --- | --- |
| `favicon.ico` @ 16/32/48 | none | 0 |
| `apple-touch-icon.png` @ 180 | Icon Background | 0.10 |
| `icon-192.png` | none | 0 |
| `icon-512.png` | none | 0 |
| `icon-maskable-512.png` | Icon Background | 0.20 |

Compose picks the **Dark Mark** over the Source Mark when the Treatment's background is
dark and a Dark Mark exists. Luminance threshold, one conditional.

**`rasterize.ts`** — resvg-wasm, initialized once and reused. `compose` → PNG bytes at
the target size. **Never resize a raster.** Rasterize each Rendition from its own
wrapper SVG at final dimensions; a reviewer should be able to grep for any downsampling
call and find none.

**Then wire the SVGO pixel-diff:** render original and optimized at 512, compare RGBA,
report percent drift as an advisory above a small threshold.

**Definition of done:**

- `square-tight` ≡ `square-padded` ≡ all three `invisible-frame-*` fixtures. Byte-identical
  is the expectation at every Rendition except `icon-maskable-512`; allow **≤0.05% of
  pixels differing with maxDelta ≤ 64** there. (Measured in spike 0.1f: identical at 16 /
  32 / 48 / 180 / 192 / 512, and 0.037% at maskable. Residual is edge antialiasing from
  differing source coordinate scales — resvg keeps transforms as `matrix()` on a `<g>`
  rather than baking them into path data, and chasing bit-identity would mean owning
  stroke/gradient/clip-path transformation ourselves.)
- Golden hashes committed for every fixture × Rendition. Any future pixel change fails
  the suite loudly — that is the entire safety net for this app.
- A test asserts the maskable Rendition's painted content lies within the centered 80%
  circle. Compute it; do not eyeball it.
- `light-mark.svg` selects a dark Icon Background and, when a Dark Mark is supplied,
  composes it into apple-touch and maskable.

---

## Phase 4 — Assemble ✅ COMPLETE

150 tests passing, full `check` gate clean. **The pipeline is functionally complete and
still entirely headless.** Goldens did not move, confirming the `compose` refactor was
behaviour-preserving.

**`favicon.svg` is Normalized like every other Rendition.** It reuses `composeInner()`
rather than reimplementing placement — otherwise a padded export would give a full-bleed
`.ico` and a tiny `.svg`, and the favicon would visibly change depending on which file
the browser picked.

**Dual-embed namespaces ids and classes via SVGO's `prefixIds`.** Two Figma exports may
both contain `id="paint0_linear"`; in one document the duplicate is ignored and *both*
marks render with the first gradient. Nothing errors — the icon is just quietly wrong in
dark mode. There is a test using two marks that genuinely share an id.

**The manifest is generated from the Rendition table**, keyed off a `manifestPurpose`
field on each spec, so adding a Rendition cannot leave the manifest stale. Cross-check
tests assert the Head Snippet and the manifest only reference files the bundle emits.

### CLI

`bun run cli <mark.svg> [outDir] [--dark f.svg] [--name X] [--bg #rrggbb] [--no-optimize]`

Lives in `src/cli/`, outside the pipeline, so it is a layer allowed to touch disk. It
prints the byte delta, every advisory phrased as something to *act on*, and the Head
Snippet.

One bug worth remembering: **the CLI ran `main()` on import**, so a test importing the
name heuristic executed the whole program. Guarded with `import.meta.main`. Any future
entry point needs the same guard.

The name heuristic lived here until Phase 6 moved it to `src/pipeline/infer.ts`, where the
panel could share it rather than making a second, subtly different guess. The CLI now
takes every default from `Pipeline.inferSettings()`.

### Phase 4 as planned

- **`favicon.ico`** — pack 16/32/48 PNGs via `ico-endec` (or the hand-rolled encoder
  from spike 0.2).
- **`favicon.svg`** — optimized source. If a Dark Mark exists, dual-embed:

  ```svg
  <g class="lm">…source…</g>
  <g class="dm">…dark…</g>
  <style>.dm{display:none}
  @media (prefers-color-scheme: dark){.lm{display:none}.dm{display:block}}</style>
  ```

  Namespace the class names and scope the `<style>` — the two marks may carry their own
  ids and classes, and a collision here silently corrupts the output.
- **`site.webmanifest`** — `name`, `short_name`, `theme_color`, `background_color`, plus
  hardcoded `display: "standalone"`, `start_url: "/"`, `scope: "/"`, `id: "/"`, and the
  three-entry `icons` array (192 any, 512 any, 512 maskable). Never `"any maskable"`.
- **Head Snippet** — a constant string; it has no variable parts.

**Definition of done:** the emitted `site.webmanifest` validates against the Web App
Manifest schema; the ICO opens in Windows Explorer and shows all three sizes; the
dual-embed `favicon.svg` swaps correctly when toggling OS theme in a browser tab.

**At this point the product is functionally complete and completely headless.** Consider
a temporary CLI entry point (`bun run src/pipeline/cli.ts in.svg out/`) — it is a few
lines, makes the remaining phases debuggable, and can be deleted or kept.

---

## Phase 5 — Electrobun shell and disk layer ✅ COMPLETE

195 tests, gate green, verified by hand: a drop writes seven files plus the Sidecar, and
a different mark under a taken name produces the collision prompt and lands in
`square-tight-2` with the original untouched.

```sh
bun run app          # electrobun build && check:bundle
bun run check:bundle # inspect the built view bundle
```

### Two bugs, both presenting as "drag and drop doesn't work"

Both were the view module failing to load, which takes the drop guards with it — so the
webview falls back to opening the dropped file. The symptom is two steps from the cause
and reads exactly like a framework limitation.

1. **`import { HEAD_SNIPPET } from '../pipeline/index.ts'`** — one string constant, which
   dragged `svgo`, `ico-endec` and `node:crypto` into the browser bundle. **1.88 MB**, and
   it could not load. `HEAD_SNIPPET` now lives in `src/shared/head-snippet.ts` with no
   imports; the pipeline re-exports it. Bundle: **16 kB**.
2. **Top-level await**, added to satisfy `unicorn/prefer-top-level-await`. Electrobun
   serves the view with a plain `<script src>` — a classic script, not a module — so it is
   a syntax error. The rule is off for `src/webview/` with that reason recorded.

### What now prevents a third

- **Inline bootstrap in `index.html`, before the module.** Registers an error handler and
  cancels the default drop behaviour. The module cannot do either for itself: a handler
  declared inside it is never registered if it fails to load. This is what finally made
  bug 2 visible.
- **`test/webview-purity.test.ts`** — no value imports from the pipeline, no `node:`
  builtins. Type-only imports pass, since they erase.
- **`scripts/check-view-bundle.ts`** — checks the *built artifact*, where both bugs were
  obvious and neither was visible in source: parses as a classic script, no `node:`
  imports, under 200 kB, and `index.html` still has its bootstrap. Matching library
  *names* was a false start — `"svgo-pixel-drift"` is a legitimate Advisory kind in the
  webview. Size is the honest signal.

### The collision guard

| found | verdict |
| --- | --- |
| nothing there | write |
| same `sourceHash` | write — that is just regenerating |
| different `sourceHash` | **ask**: Save as `-2` / Replace / Cancel |
| no Sidecar, or a corrupt one | **ask** |

The last row is deliberate. A directory we did not create might be someone's `public/` or
a git worktree, and overwriting it because the *name* matched would be the worst thing
this app could do. `writeBundle` also never deletes a file it did not author.

### Known gaps, deliberately

- **Window geometry is restored but not updated.** `BrowserWindow` exposes
  `close`/`created`/`hidden` and no resize or move event, so there is nothing to observe
  without polling. `process.on('beforeExit')` is *not* the answer — it does not fire,
  because Electrobun's quit path calls `forceExit`. State is written on change and at
  startup instead.
- Settings in the webview were `PLACEHOLDER_SETTINGS`, and `recallSettings` was written and
  tested but not wired to anything. Both resolved in Phase 6.

### Phase 5 as planned

**`src/bun/`** — window creation, RPC handlers, and the only code in the app that
touches the filesystem.

- Load the resvg `.wasm` from a `build.copy`-declared bundled asset at startup;
  initialize once, reuse. It lands at `Resources/app/`, so resolve it with
  `join(import.meta.dir, "..", "resvg.wasm")` — **`process.cwd()` points at `bin/`**.
- RPC surface, typed:
  - `generate(sourceSvg, darkSvg, settings)` → `{ files: base64 map, advisories, … }`
  - `pickOutputRoot()` → native folder picker
  - `revealInExplorer(path)`
- **Output Root** and window geometry persist to app data.
- Write `<Output Root>/<Bundle Name>/`, plus the **Sidecar** `manifesto.json`
  (settings + `sourceHash`).
- **Collision guard:** on drop, if the target folder has a Sidecar whose `sourceHash`
  differs from the incoming mark, prompt **Replace / Save as `<name>-2` / Cancel**. This
  is the only remaining path to data loss in the app — do not ship without it.
- **Bundle Name** is seeded from the filename slug at drop and never auto-follows Name.
  Renames apply on blur, and route through the same collision guard.

The webview gets **no filesystem access**. It reads the dropped `File` as text and sends
a string; everything else crosses as base64 (RPC is JSON-over-WebSocket — binary cannot
cross raw).

**Three things to get right on day one, all learned the hard way in spike 0.3:**

- **Register drop guards first, before anything that can throw.** `preventDefault()` on
  **`document` and `window`, capture phase, for all four drag events** — otherwise a
  dropped file opens in an external window. `preventDefault()` only; adding
  `stopPropagation()` starves the real handler.
- **`import { Electroview } from "electrobun/view"`** — the default export is a
  namespace object `{ Electroview }`, not the class. Getting this wrong throws on the
  import line and silently kills every listener in the module.
- **Add a `window.onerror` / `unhandledrejection` handler that paints into the UI.**
  Without one, a script dying on line 4 is indistinguishable from a framework
  limitation. This cost real time in the spike.

**Definition of done:** drop an SVG, seven files plus the Sidecar appear on disk; drop a
different SVG with the same filename and the collision prompt appears; relaunch and the
Output Root is remembered.

---

## Phase 6 — Panel, inference, live regeneration ✅ COMPLETE

225 tests, gate green, view bundle **28 kB**.

### The one design decision that was not in the plan

**A live editor that writes to disk needs a rule about when it may open a modal.** The
collision guard is the only thing standing between the user and lost work, so it cannot
be dropped — but a debounced request arrives every 150 ms while a colour picker is being
dragged, and a native modal on each one is unusable.

`GenerateRequest.trigger` resolves it, and the rule is on the wire where both sides can
see it:

- `drop` / `rename` — the user just chose this destination. Full collision guard.
- `edit` — **never prompts.** Writes only where a previous write of this same mark already
  lives; otherwise reports `writtenTo: null` and the panel says "Not written."

This works out because a successful drop leaves a Sidecar with our hash, so every
subsequent edit sees `same-mark` and flows. A cancelled drop leaves the panel fully
functional and silently not writing, which is the honest outcome of the user having
declined.

### What landed where

- **`src/pipeline/infer.ts`** — pure. `inferColors()` takes a `PixelBuffer`, not an SVG,
  so the histogram is testable without a rasterizer while the fixtures still prove the
  pixel facts.
- **`Pipeline.inferSettings(svg, filename)`** — the one-call form. The CLI now takes every
  default from it, so `manifesto mark.svg` and a drop produce the same Asset Bundle.
- **`src/bun/render-cache.ts`** — wraps `render` in something with the identical interface,
  keyed on `(sourceSvg, darkSvg, iconBackground, optimizeSvg)`. Callers cannot tell it is
  there and nothing is invalidated by hand. `RenderSettings` vs `ManifestSettings` means
  it *cannot* be handed a Name to key on.
- **`src/webview/use-bundle.ts`** — debounce, request ordering by ticket, and the session
  mirror. Responses that have been superseded are dropped rather than applied, so a slow
  re-render cannot overwrite a later metadata edit.

### Two things worth remembering

**Sampling only fully opaque pixels is not a shortcut.** Rasterizers differ on whether the
RGBA they return is premultiplied; at alpha 200 that is the difference between a colour
and a 22%-darker lie. At alpha 255 both representations are identical, so the answer is
correct either way — and antialiased edge blends, which are not the mark's colours at all,
drop out for free.

**`pixelDriftPercent` moved to `optimize.ts`** and `test/pipeline-purity.test.ts`
immediately failed the barrel re-export. Correctly: it rasterizes, so it must stay
reachable only through `createPipeline()`. The guard earned its keep on a refactor that
had nothing to do with it.

### Phase 6 as planned

**Inference** (pure — belongs in `src/pipeline/`, tested with the fixtures):

- **Name** — filename stem, split on `-_`, drop noise tokens (`logo` `icon` `mark`
  `favicon` `final` `copy` `export` `v2` `symbol`), title-case. Fall back to the raw
  stem if everything strips away.
- **Short name** — Name if ≤12 chars, else its first word.
- **Theme Color** — most frequent *saturated* painted color at 64×64, ignoring
  near-greys and near-black/white. A black glyph must not tint someone's address bar.
- **Icon Background** — contrast-driven, not sampled: mean luminance of painted pixels;
  dark mark → `#FFFFFF`, light mark → `#111111`.
- **Splash Background** — mirrors Icon Background.

**Panel:** Name, Short name, Theme Color, Icon Background, Splash Background, plus
Bundle Name and the optional Dark Mark drop target. Inferred values render plainly and
editably — **no "inferred" badge**. On drop, if a Sidecar exists for that Bundle Name
with a matching hash, load from it instead of re-inferring.

**Regeneration:** debounced ~150 ms. Split the pipeline so metadata-only changes (Name,
Short name, Theme Color, Splash Background) skip rasterization entirely; only Icon
Background, Dark Mark and the SVGO toggle trigger a re-render.

**Definition of done:** dragging the Icon Background picker updates disk and previews
continuously without stutter; editing Name rewrites only `site.webmanifest`; the folder
never renames on its own.

---

## Phase 7 — Previews ✅ COMPLETE

232 tests, gate green, view bundle **33 kB**.

### The browser tab could not use an `<img>`

A dual-mode `favicon.svg` swaps on `prefers-color-scheme`. Inside an `<img>` it obeys the
*viewer's* OS theme, so the light and dark mocks would show the same mark — and the dark
mock would be a lie exactly when someone has supplied a Dark Mark to check it.

So the favicon is **inlined**, and the page forces which half shows with two-class
selectors that outrank the single-class rules inside the file, in either media state.
That needs the exact class names, so `FAVICON_LIGHT_CLASS` / `FAVICON_DARK_CLASS` moved to
`src/shared/bundle.ts` under the usual rule — the webview needs them, so they live where
no import can follow them into the browser bundle.

Duplicate element ids across the two inlined copies are harmless: the copies are the same
document, so any cross-reference resolves to an identical element.

### The Safe Zone constant is duplicated, and the duplicate is tested

`SAFE_ZONE_DIAMETER` cannot be imported into the webview — that is a value import from the
pipeline, the 1.88 MB failure. So `Previews.tsx` holds its own `0.8`, and
`test/webview-purity.test.ts` asserts the two are equal. A ring drawn at the wrong
diameter would be worse than no ring: it would certify marks that actually get clipped.

### Two smaller decisions

**The SVGO toggle moved out of the settings panel** onto the Source Mark row, beside the
byte delta and the pixel-drift verdict. "Optimize SVG" next to evidence is a decision; the
same checkbox in a list of colours is a shrug. The drift advisory is filtered out of the
advisory list for the same reason — the row says it better, with the toggle right there.

**The squircle is an SVG `clipPath` with `clipPathUnits="objectBoundingBox"`**, not a CSS
`clip-path: path()`. `path()` takes user units, so the normalized coordinates would have
clipped the image to a one-pixel shape.

`Results.tsx` groups the four output sections: `App` composes the session, `Results`
composes the output.

### Phase 7 as planned

Three context previews, **at true size by default**:

1. **Browser tab** — light and dark mocks, `favicon.svg` rendered *as SVG* at exactly
   16 CSS px. This is the one preview that must not use the PNG bytes: in a real tab the
   browser is the renderer, so using it here is the truthful choice.
2. **iOS home screen** — `apple-touch-icon.png` with iOS corner radius on a neutral
   backdrop.
3. **Android maskable** — `icon-maskable-512.png` with a mask-shape toggle (circle /
   squircle / rounded-square / none) and a **Safe Zone** ring overlay.

Everything except the tab preview uses the base64 PNG bytes from the pipeline — the
preview must show *what resvg produced*, not Chromium's opinion of the source file.

Also in this phase: the SVGO row near the Source Mark —
`acme.svg  12.4 KB → 3.1 KB (−75%)  ✓ pixel-identical  [▢ optimize]` — with the check
becoming an amber drift warning when the pixel-diff exceeds threshold. Plus the advisory
list (Wordmark Warning, text elements, external images).

Build #3 first. It is the highest-value widget in the app and it visually validates the
Phase 3 Safe Zone math while that code is still fresh.

**Definition of done:** every advisory has a visible surface; the maskable mask toggle
works; nothing is scaled up by default.

---

## Phase 8 — Build ✅ COMPLETE

241 tests, gate green. `Manifesto-Setup.exe` + a 31.5 MB payload, unsigned, no update
server.

```sh
bun run dist            # electrobun build --env=stable
bun run check:package   # inspect the packaged payload
```

### The main-process bundle was 9.7 MB of dead 3D engine

`electrobun/bun` imports `three` and `@babylonjs/core` at the top of its barrel and only
re-exports them — nothing inside Electrobun uses either. Both have side effects, so the
bundler cannot drop them, and importing `BrowserWindow` cost **9.7 MB** of WebXR and
WebGPU shader code.

`build.bun` takes full `Bun.build` options, so a resolver plugin in `electrobun.config.ts`
maps both to an empty module. **9.7 MB → 1.2 MB.** `external` would not work: the imports
are evaluated at load time and the packages are not shipped with the app, so it would fail
on launch rather than at build.

### ASAR would break WASM resolution — leave `useAsar` off

The launcher, with ASAR enabled, extracts `bun/index.js` to a **temp file** and runs that.
`import.meta.dir` then points at the OS temp directory, and
`join(import.meta.dir, '..', 'resvg.wasm')` cannot find anything. The app would start
normally and fail on the first drop.

`useAsar` defaults to false, so flat files are used and the path holds — but "defaults to
false" is not a guarantee, so `scripts/check-package.ts` fails if an `app.asar` appears.
It also caps the bun bundle at 3 MB, so the 3D-engine plugin silently ceasing to match is
caught rather than merely regrettable.

### Verified, not assumed

Running the packaged app prints `[manifesto] output root:` — which is after
`createPipeline()`, so **the WASM resolves in the packaged build**. That was this phase's
stated risk and it is now checked on every `dist`.

The same run surfaced `ERROR: Parent window has invalid client area: 0x0`, which is the
mechanism behind the missing scrollbar — see the note in `src/bun/index.ts`.

### The app was DPI-unaware, which cost both crispness and correct window metrics

Reported as "the text looks blurry compared to my other windows", and it was real.
`launcher.exe` ships with **no embedded manifest at all** and `libNativeWrapper.dll` never
calls `SetProcessDpiAwareness`, so the process was DPI-unaware. On the reporting machine —
3840×2160 at 150% — Windows rendered the whole window at 96 DPI and bitmap-stretched it by
1.5×. Everything was soft.

`src/bun/windows-dpi.ts` calls `SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)` over
`bun:ffi` as the **first statement in the app**. Awareness is latched the moment the
process touches a window or a device context, so it cannot move later in the file.
Measured: `GetDpiForSystem()` returns 96 before the call and 144 after.

Two consequences worth knowing:

- **Window frames become physical pixels.** A frame that used to be stretched to 1.5× no
  longer is, so `windowFrame()` scales the intended CSS size up by the display factor,
  clamps to 90% of the display, and centres. Without that the window would open at
  1/scale of its intended size on every scaled display.
- **Every Windows API now reports true values.** The display turned out to be 3840×2160,
  not the 2560×1440 that DPI-unaware tooling had been reporting — which is worth
  remembering the next time a measurement here looks off by a suspiciously round factor.

The stored window frame was deleted rather than migrated. It was never updated (there is no
resize event), so it could only ever be the first-run default read straight back — and it
blocked any new default from taking effect for anyone who had already launched the app.

### The missing scrollbar was Edge's overlay scrollbars, not sizing

Two wrong guesses first, both recorded because the reasoning matters. `overflow-y: scroll`
assumed the document was overflowing. When that failed, a `setFrame` nudge assumed the
webview was taller than its window.

The instrumented run settled it: `innerHeight === clientHeight === 840`, and after a drop
`scrollHeight` was **1567** against a client height of **840**. The document was
overflowing and scrollable the whole time — WebView2 simply draws *fluent overlay
scrollbars*, which occupy no space and stay invisible until you scroll. Styling
`::-webkit-scrollbar` opts the document out of overlay behaviour entirely.

The `setFrame` nudge was then removed, verified against the same measurement. A workaround
kept "just in case" after its premise is disproved is how a codebase accumulates
superstition.

### `generate` moved to its own module with an injected collision prompt

Extracted from `index.ts` when it tripped the file-length limit, which was a fair signal.
The prompt is now a dependency rather than an import, so the trigger policy is testable
without clicking a native modal — `test/generate.test.ts`, 9 tests, including the
load-bearing one: **an edit never prompts, it declines to write.**

### Phase 8 as planned

`electrobun build` producing an unsigned Windows 11 `.exe`. No cert, no notarization, no
update server. Confirm the `.wasm` asset resolves in the packaged build — bundled-asset
resolution differing between dev and packaged is the classic failure here, and it will
not show up until this phase.

**Definition of done:** the packaged `.exe` runs on a machine that has never had Bun
installed, and produces byte-identical output to `bun test`'s golden hashes.

---

## The pipeline's interface

```ts
const pipeline = await createPipeline(wasmBytes)
pipeline.buildBundle(sourceSvg, darkSvg, settings)   // synchronous
```

**Nothing that rasterizes is reachable without `createPipeline`.** resvg's WASM module is
process-global — `initWasm` throws *"Already initialized"* on a second call — so there is
exactly one rasterizer per process and threading one around as a dependency would be
inventing a seam with only one possible adapter. The state lives in `rasterize.ts`;
`createPipeline` is the only thing allowed to initialise it.

The point is that "call this first" became unrepresentable rather than documented. It was
previously enforced at runtime four call frames below the seam, and it cost debugging time
in Phase 3 and again in Phase 4.

`buildBundle` is **synchronous**. Every stage is synchronous once the WASM is loaded, and
loading is `createPipeline`'s job — the `oxlint-disable require-await` is gone.

`Pipeline` also exposes `normalize`, `measureMark`, `rasterize`, `rasterizeToPixels` and
`pixelDriftPercent` as the module's **internal seam**: private to the implementation,
exposed so its own tests can measure geometry and Safe Zone compliance directly. Those are
the tests that caught the `inset: 0.2` bug; routing them through `buildBundle` would have
hidden it behind seven PNGs.

`test/pipeline-purity.test.ts` asserts none of those names reappear on the barrel — if
they do, the ordering guarantee is void.

**Still true:** Bun runs `describe` bodies during collection, before `beforeAll`, so
`pipeline` is only bound inside a test. That is the test framework's lifecycle, not the
pipeline's interface.

## The render / metadata seam

```ts
const rendered = pipeline.render(sourceSvg, darkSvg, renderSettings)  // expensive
const bundle = pipeline.withManifest(rendered, manifestSettings)      // cheap
pipeline.buildBundle(sourceSvg, darkSvg, settings)                    // exactly both
```

`Settings` is now `RenderSettings & ManifestSettings` — an intersection, so one-shot
callers still pass one flat object, while `render()` and `withManifest()` take the halves
separately. That is where the partition becomes operational rather than declared.

| changes pixels | metadata only |
| --- | --- |
| `iconBackground` | `name` |
| `optimizeSvg` | `shortName` |
| the Dark Mark *(a separate argument)* | `themeColor` |
| | `splashBackground` |

**`optimizeSvg` is easy to misfile.** design-v1.md previously listed only Icon Background and
the Dark Mark; but `optimizeSvg` feeds SVGO and changes `favicon.svg`'s bytes, so it is a
render input. There is a test asserting exactly that.

Phase 6 holds one `RenderedMark` across panel edits: a metadata change is a JSON rewrite,
not six renders. `test/incremental.test.ts` asserts the load-bearing property — a metadata
edit leaves every other file **byte-identical** — plus its converse, so the split cannot
quietly put something cheap on the expensive side or vice versa.

Measured on `multicolor`: `render()` **60.6 ms**, `withManifest()` **0.007 ms**. A
pixel-affecting edit spends 40% of the 150 ms debounce budget; a metadata keystroke spends
under 1%.

Without this the panel would re-derive the partition in `src/webview/`, outside the purity
guard and untouched by any fixture.

## The golden net

`test/golden/renditions.json` hashes **`buildBundle`'s own output map**, keyed
`fixture/scenario/filename`. Regenerate with `bun run goldens`, never to make a red suite
green.

An earlier version reimplemented the render loop — `normalize` → `compose` → `rasterize`
— and so skipped `validate`, `optimize` and `markFor`. The hashes still matched, but only
because SVGO happens to be pixel-neutral on these fixtures: a property of the fixtures,
not of the design. The day optimization moved a pixel, the goldens would have kept passing
while the app shipped something else.

| | before | after |
| --- | --- | --- |
| hashes | 84 | 126 |
| covering `favicon.ico` | 0 | 18 |
| covering `favicon.svg` | 0 | 18 |
| covering `site.webmanifest` | 0 | 18 |
| covering a Dark Mark | 0 | 21 |

Three scenarios: `default`, `dark-on-dark` (dark Icon Background + a Dark Mark, so
`markFor` and the dual-embed `favicon.svg` are exercised), and `unoptimized`. A test
asserts the scenarios genuinely produce different bytes — a scenario that matched
`default` would be dead weight pretending to be coverage.

Rendered with `GOLDEN_SETTINGS`, deliberately separate from `defaultSettings` so the
tests' convenience object can evolve without silently rewriting every hash.

Geometry tests (`normalization equivalence`, Safe Zone) stay on the pipeline's internal
seam. They assert *properties* rather than hashes, because a hash tells you something
changed but never what.

## Toolchain

TypeScript **7.0.2** (Go-native, GA 8 July 2026), **oxlint** + **oxfmt**, `bun test`.

```sh
bun run check   # fmt:check → lint:types → typecheck → test
bun run lint    # fast, no type info — for the editor
bun run fmt     # write
```

**Why oxlint rather than ESLint:** TypeScript 7's compiler API is not stable until 7.1,
which breaks tools that call into it — `typescript-eslint` among them. oxlint is
Rust-native and never touches that API, and its type-aware engine (`tsgolint`) wraps tsgo
directly and tracks TS 7.0.2, covering 59 of typescript-eslint's 61 type-aware rules.
The ecosystem risk TS 7 introduces is precisely the risk oxlint does not carry.

**Why not Vite+:** it bundles oxlint and oxfmt anyway, and this project would use almost
nothing else in it. Electrobun does its own bundling via `Bun.build`, serves `views://`
itself, and the suite is `bun test` — adding Rolldown/Vite would mean two build systems
disagreeing about the same files.

**Markdown is excluded from oxfmt.** It re-pads tables into diff churn and rewrites
embedded code samples — it turned the Head Snippet's `<link ...>` into `<link ... />`,
and that snippet must stay byte-identical to `HEAD_SNIPPET` in `assemble.ts`.

**`docs/reference/` is excluded from oxlint but stays inside tsconfig's `include`.** Its
value is being the code that produced the measurements in `docs/phase-0-findings.md`;
rewriting it to production standards would destroy that. So "still compiles" is
enforced, "maintained to standard" is not.

Every rule switched off in `.oxlintrc.json` carries its reason inline. The config is
JSONC and `.vscode/settings.json` maps it as such — the reasons are the point.

## Standing constraints

Hold these across every phase:

1. **`src/pipeline/` imports nothing from `src/bun/`, `src/webview/`, or `node:fs`.**
   Enforced by test. Everything else depends on it.
2. **No raster is ever resized.** Every Rendition is rasterized from vector at its final
   dimensions. The one legitimate raster read is Normalization's alpha-scan probe, which
   measures — it never becomes output.
3. **Painted extents come from the alpha channel, never `getBBox()`.** `getBBox()` is a
   layout box and lies about any mark carrying an invisible frame.
4. **Never re-parse `Resvg.toString()` output.** Its `xlink` serialization is broken.
5. **Resolve bundled assets from `import.meta.dir`, never `process.cwd()`.**
6. **No non-null assertions.** `!` asserts what the compiler cannot check, which defeats
   `noUncheckedIndexedAccess`. For indexed reads into pixel buffers write `buf[i] ?? 0` —
   unreachable when the index is in range by construction, but checked rather than
   asserted. In the alpha-scan probe it also reads correctly: no pixel is not painted.
7. **Golden hashes are the contract.** A pixel change that isn't intentional is a bug.
   Never regenerate goldens to make a suite pass without stating what moved and why.
8. **The webview never touches the filesystem.**
9. **The app never parses or rewrites user HTML.** The Head Snippet is copy-only.
10. **Advisories never block** — they inform; the user decides. The one hard failure is a
    mark with no painted pixels, which cannot produce an icon at all.
