# Manifesto — v1 design

Outcome of the design session. Terms in **bold** are defined in [CONTEXT.md](./CONTEXT.md).

## What it is

An Electrobun desktop app. Drop an SVG; get the complete set of icon assets a website
needs, written to disk immediately, previewed in context, and tweakable afterward.

## What it is not

- Not an OG / **Share Card** generator. Share Cards are per-page and need text layout;
  Asset Bundles are per-site. Different tool.
- Not a PWA configurator. `display`, `start_url`, `scope` are hardcoded.
- Not a raster converter. SVG in, or nothing.
- Not a project manager. No registry, no recents, no library.

---

## The Asset Bundle

Seven files plus the **Sidecar**:

| File | Size | Icon Background | Padding | Notes |
| --- | --- | --- | --- | --- |
| `favicon.svg` | vector | transparent | none | SVGO'd source; dual-embed if a **Dark Mark** exists |
| `favicon.ico` | 16+32+48 | transparent | none, full bleed | At 16px every pixel is load-bearing |
| `apple-touch-icon.png` | 180 | **opaque, forced** | ~10% | iOS composites transparency onto black; iOS applies its own corner radius, so don't pre-round |
| `icon-192.png` | 192 | transparent | none | `purpose: "any"` |
| `icon-512.png` | 512 | transparent | none | `purpose: "any"` |
| `icon-maskable-512.png` | 512 | **opaque, forced** | 20% total | Mark inside the centered 80% **Safe Zone** |
| `site.webmanifest` | — | — | — | |
| `manifesto.json` | — | — | — | **Sidecar**, not a web asset |

Deliberately excluded: `mstile-*`, `browserconfig.xml`, the pre-iOS-8 apple-touch
ladder, the android-chrome density ladder. Every one targets a dead platform.

`any` and `maskable` are **separate files**. `purpose: "any maskable"` on one file is an
anti-pattern Chrome DevTools warns on — the maskable padding gets preserved in `any`
slots, rendering the logo 20% smaller than its neighbours on the home screen.

### Head Snippet

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
```

Copy button only. The app never parses or rewrites the user's HTML — that is a far
bigger promise than this app should make.

---

## Pipeline

**Vector-space composition.** Every **Treatment** is applied by synthesizing a wrapper
SVG around the mark and rasterizing *that* at the target size:

```svg
<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="{iconBackground}"/>
  <g transform="translate(51.2 51.2) scale(0.8)">{normalizedMark}</g>
</svg>
```

No **Rendition** is ever downsampled from a master raster. Invisible at 512, decisive
at 16 — downsampling turns a glyph into grey mush where direct vector rendering keeps
the stems crisp. This is also why no raster image library (Photon, sharp) is needed.

### Stages

1. **Read** — the webview reads the dropped file as *text* (SVG is text) and sends the
   string over RPC. The webview never touches the filesystem.
2. **Validate** — warn on `<text>` (resvg renders it blank without font buffers); strip
   `<script>`; report external `<image href="https://…">`. Reporting is all that's owed:
   resvg-wasm never resolves remote refs, so no network call is possible (verified in
   spike 0.1 with `fetch` trapped).
3. **Optimize** — SVGO, conservative preset. Report byte delta, and pixel-diff the
   original vs optimized at 512 to catch SVGO's known failures (mangled `<use>`,
   collided gradient IDs, dropped clip paths). Toggleable to pass-through.
4. **Normalize** — find the mark's painted extents by **alpha-scanning a probe render**,
   then scale to fit a canonical square. Without this, identical logos exported
   differently from Figma produce visibly different icons and the user can't tell why.
   Raise the **Wordmark Warning** if aspect ratio > ~2:1. No painted pixels → hard error.

   **Not `getBBox()`.** resvg's bounding box is a *layout* box: a transparent or
   `fill="none"` frame rect — which Figma and Illustrator add routinely to lock an export
   — inflates it to the full canvas. Measured, that renders the mark at 13.4% of a
   Rendition instead of 80.6%, silently. The alpha channel is the only ground truth for
   "where is the mark", and the probe costs 7.7 ms once per Source Mark.
5. **Compose + rasterize** — wrapper SVG per Rendition → resvg-wasm at final size.
   Renditions whose **Icon Background** is dark compose the **Dark Mark** if present.
6. **Assemble** — pack 16/32/48 PNGs into `favicon.ico` via `ico-endec`; emit
   `site.webmanifest`; emit `favicon.svg`.

**Shape:** the pipeline is a pure function —

```ts
(sourceSvg: string, darkSvg: string | null, settings: Settings) => Map<string, Uint8Array>
```

No `fs`, no Electrobun imports, no RPC. Bun is a thin shell that calls it and writes
the result; the webview gets the same map base64'd. This exists for testability: the
app's entire output is pixels, and a 4px Safe Zone error looks fine in a preview and
clips someone's logo on a Pixel. Fixture SVGs (square, wordmark, monochrome,
multicolor, no-viewBox, transparent, opaque) + golden hashes catch that; they can only
run if the pipeline doesn't need a window.

**Dependencies:** `@resvg/resvg-wasm`, `svgo`, `ico-endec`. Nothing else.

`resvg-wasm` over native `resvg-js` — the native build ships per-platform `.node`
binaries Electrobun's bundler must sidecar per target, trading a real packaging problem
for a performance win that is imperceptible at 6 icons. Over webview-canvas
rasterization — canvas resolves `<text>` against the *user's installed fonts*, so the
same file silently produces different output on different machines. resvg's font
isolation looks like a limitation but is the correct behaviour: it cannot accidentally
succeed. It also renders byte-identical on every OS, which makes going cross-platform
later a shell problem, not a pipeline problem.

---

## Interaction

**Drop → files exist.** Generation is immediate, into `<Output Root>/<Bundle Name>/`.
The panel appears *after*, not before.

### Panel — 5 fields

| Field | Inference |
| --- | --- |
| Name | Filename stem, split on `-_`, noise tokens dropped (`logo` `icon` `mark` `favicon` `final` `copy` `export` `v2` `symbol`), title-cased. Falls back to raw stem. |
| Short name | Name if ≤12 chars, else its first word |
| **Theme Color** | Most frequent *saturated* painted color at 64×64, ignoring near-greys and near-black/white — a black glyph shouldn't tint someone's address bar black |
| **Icon Background** | Contrast-driven, not sampled: dark mark → `#FFFFFF`, light mark → `#111111`. The goal is that the mark is *visible*, which sampling from the mark works against. |
| **Splash Background** | Mirrors Icon Background |

Plus **Bundle Name** (own field, seeded from filename slug, no auto-follow, rename on
blur) and an optional **Dark Mark** drop target.

Inferred values are shown plainly and editably — no "inferred" badge. A wrong name in a
visible field is self-evident.

Hardcoded: `display: "standalone"`, `start_url: "/"`, `scope: "/"`, `id: "/"`, `icons`.

### Regeneration

Live, debounced ~150 ms. **Icon Background, the Dark Mark, and the optimize toggle**
change pixels; Name, Short name, Theme Color and Splash Background are JSON only.

That partition is a type, not a comment: `RenderSettings` vs `ManifestSettings`, with
`pipeline.render()` producing the expensive half and `pipeline.withManifest()` completing
the Bundle from it. Hold one `RenderedMark` across edits and a metadata change costs a
JSON rewrite instead of six renders. (`optimizeSvg` is easy to misfile — it feeds SVGO,
so it moves pixels.)

Watching the maskable preview update as you drag a color is how the user learns what Icon
Background *is*.

Accepted cost: the output folder is a live mirror of the panel, not a snapshot.
Contained because it lives under our own Output Root, never in the user's repo.

### Previews — in situ, at true size

1. **Browser tab** — light and dark mock, `favicon.svg` at *actual 16 CSS px*.
2. **iOS home screen** — `apple-touch-icon.png` with iOS corner radius.
3. **Android maskable** — mask-shape toggle (circle / squircle / rounded-square / none)
   plus a **Safe Zone** ring overlay.

The maskable widget is the highest-value thing in the UI. "The centre 80% is guaranteed
visible" is abstract; a squircle sliding over your actual icon is instantly legible.

**True size is the default.** Every generator that shows a 128px thumbnail is
flattering you. The point is the moment of "oh, that's illegible" — which is what sends
someone back to Figma for a simpler monogram.

**Data path:** rasters travel as base64 data URLs over RPC (~135 KB per generation,
imperceptible on a user-triggered action). `views://` only resolves build-time bundled
assets, and betting the preview layer on `file://` behaviour across WebView2 and
WKWebView is not worth the saved bytes.

The previews must show *what resvg produced*, not what the webview would produce —
otherwise you're looking at Chromium's opinion of your file while your users see
resvg's. **One exception:** the tab preview renders `favicon.svg` as SVG, because there
the browser genuinely *is* the renderer. Each preview uses the renderer that will
actually be used in production.

---

## Dark Mark

Optional second SVG, dropped in the panel. Emitted by **dual-embed**, not recoloring:

```svg
<g class="lm">…source…</g>
<g class="dm">…dark…</g>
<style>
  .dm { display: none }
  @media (prefers-color-scheme: dark) { .lm { display: none } .dm { display: block } }
</style>
```

Works for any pair — monochrome, multicolor, or different shapes. No paint parsing, no
color guessing, no failure mode. If the Source Mark is **monochrome**, the app may
offer to derive the Dark Mark by recoloring; that's a convenience feeding the same
path, not a separate feature, and it's cuttable.

Also composes into Renditions whose Icon Background is dark
(`apple-touch-icon.png`, `icon-maskable-512.png`).

Chrome, Firefox and Edge honour this and swap live on OS theme change. **Safari
ignores it** and renders the default state — so this is an enhancement, never a licence
to ship an illegible light-mode default.

---

## Persistence

Single-document. One mark in the window; dropping another replaces it.

Settings live in the **Sidecar**, not an app database — the Bundle becomes
self-describing, greppable, diffable, and committable, and the app holds no hidden
state that can go stale when a folder moves.

App-level state, remembered across launches: **Output Root**, window geometry.

**Collision guard.** The Sidecar stores the Source Mark's content hash. Two different
`logo.svg` files from two clients would otherwise silently clobber each other — the only
remaining path to data loss, now that the project-write feature is out of scope:

> `acme/` was generated from a different mark.
> **Replace** · **Save as `acme-2`** · **Cancel**

---

## Packaging

Personal tool. Windows 11 only, unsigned, `electrobun build` for a real `.exe`. No
cert, no notarization, no update server — that infrastructure is orthogonal to whether
the maskable Normalization is correct, which is the hard part and the part worth the
hours. Electrobun's signing and bsdiff updater are still there later.

---

## Verified in Phase 0

All spikes resolved — see [spike/FINDINGS.md](./spike/FINDINGS.md).

- **Normalization** works, via alpha scan rather than `getBBox()` (see stage 4 above).
  Verified to make differently-exported copies of the same mark produce byte-identical
  Renditions at 6 of 7 sizes, and to place 0.00% of maskable pixels outside the Safe Zone.
- **`ico-endec`** emits correct PNG-embedded ICO. Adopted as-is.
- **Electrobun round-trip** confirmed: OS drop → `File` → `file.text()` → RPC → resvg →
  base64 → `<img>`, 28 ms end to end. RPC is JSON-over-WebSocket, so base64 is the only
  way binary crosses — not a trade-off, a constraint.

Three footguns, now recorded as standing constraints in PLAN.md: the webview opens
dropped files unless `preventDefault` is registered on document+window in the capture
phase; `electrobun/view`'s default export is a namespace object, not the class; and
`process.cwd()` is `bin/`, not the app root.

## Deferred, deliberately

- **Share Card** / OG images — see below.
- Project registry + write-into-repo — needs an overwrite diff to be safe.
- Legacy icon set — behind a toggle if ever.
- PNG optimization (oxipng-wasm) — resvg's PNG output isn't crushed.
- Cross-platform builds, signing, auto-update.

---

## v2 candidate — Share Card via Satori

The reason Share Cards were cut is that they need text layout, and text layout is a
layout engine. [Satori](https://github.com/vercel/satori) is that engine, and it fits
this app's architecture unusually well:

- **It outputs SVG, not pixels.** JSX + a flexbox CSS subset → SVG string. That lands
  exactly on the input of the pipeline we already have — Satori composes, resvg-wasm
  rasterizes. It's a new *front* stage, not a parallel pipeline. This is precisely how
  Vercel's own OG image generation works.
- **Its font constraint matches resvg's.** Fonts must be passed as ArrayBuffer (TTF /
  OTF / WOFF — not WOFF2). We already accepted that constraint for `<text>` in Source
  Marks, so bundling a font is one problem solved twice.
- **It runs in Web Workers and bundles its WASM as base64**, so it drops into the Bun
  side without a native build step — same reason we chose resvg-wasm.

Scoped as **one Share Card for the home page**, this stays inside the "once per site"
cardinality that made Asset Bundles coherent in the first place, and sidesteps the
per-page templating that would make it a different product.

Known costs to weigh before committing:

- **Flexbox only.** No CSS Grid, no `calc()`. Layouts must be authored against Yoga's
  subset, so an existing design can't simply be pasted in.
- **A font must ship with the app**, which adds real bytes to a 14 MB bundle and drags
  in font licensing as a question.
- **The template still has to be designed.** Satori removes the engineering barrier,
  not the design one — a bad 1200×630 layout is still a bad Share Card.
