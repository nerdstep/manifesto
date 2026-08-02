# Manifesto

> Drop an SVG, get every icon asset a website needs.

![hero](./hero.png)

A desktop app for Windows. Drop one SVG and it writes six icon files, a web app manifest,
and the four `<head>` tags that point at them — then shows you each one at the size the
platform will actually draw it.

## Why

The platform requirements are unobvious, unforgiving, and fail silently:

- **iOS composites transparency onto black.** A transparent `apple-touch-icon` becomes a
  logo on a black square on someone's home screen.
- **Android's maskable Safe Zone is a *circle*.** A square inset cannot express it: a mark
  that paints into its own bounding-box corners escapes a 0.6-side box, because the
  half-diagonal is 0.424 against a safe radius of 0.4. Its corners get cropped by the
  launcher.
- **A 16px favicon downsampled from a 512px master turns to grey mush.** Every rendition
  here is rasterized from its own document at final size. Nothing is ever resampled.

None of these look wrong until they are on somebody else's phone. Manifesto's previews
render the bytes that were just written to disk — never a recomputed approximation — because
a Safe Zone breach looks perfectly fine in a preview that recalculated it.

## What you get

```text
acme-logo/
├── favicon.ico            16 · 32 · 48, PNG-embedded
├── favicon.svg            vector; swaps on prefers-color-scheme if you supply a dark logo
├── apple-touch-icon.png   180², always opaque
├── icon-192.png           transparent, purpose "any"
├── icon-512.png           transparent, purpose "any"
├── icon-maskable-512.png  opaque, fitted to the circular Safe Zone
├── site.webmanifest       name, short_name, theme_color, background_color, icons
└── manifesto.json         the settings used, so re-dropping restores them
```

Plus the snippet to paste into your `<head>` — the one step the app deliberately will not
do for you, because it never parses or rewrites your HTML.

## Running it

```sh
bun install
bun run dev          # build + launch
```

| Command | What it does |
| --- | --- |
| `bun run dev` | build, check the view bundle, launch |
| `bun run dev:watch` | Electrobun's watcher — skips the bundle check |
| `bun run dist` | packaged, unsigned Windows installer |
| `bun run check` | format, lint, typecheck, test — the gate |
| `bun run check:package` | inspect the packaged payload after `dist` |

## CLI

The same pipeline, headless. Every default is what the app's panel would open with, so the
CLI and a drop produce identical output from the same file.

```sh
bun run cli acme-logo.svg ./public
bun run cli acme-logo.svg --dark acme-dark.svg --bg '#111111'
bun run cli --snippet
```

```text
--dark <file.svg>     dark-mode logo, used on dark backgrounds and in favicon.svg
--name <string>       manifest name              (default: inferred from the filename)
--short <string>      manifest short_name        (default: inferred, or --name)
--theme <#rrggbb>     theme_color                (default: inferred from the artwork)
--bg <#rrggbb>        icon background            (default: inferred by contrast)
--splash <#rrggbb>    manifest background_color  (default: same as --bg)
--no-optimize         skip SVGO
--snippet             print the <head> snippet and exit
```

Defaults are **inferred from pixels, never from markup** — `fill="currentColor"`, CSS
variables, `<use>` into a symbol, and gradients are all invisible to a parser and obvious in
a raster.

## How it is built

Electrobun: a Bun process owning the window and every filesystem touch, and a Preact +
Tailwind webview that has no filesystem access at all. Rendering is `@resvg/resvg-wasm`.

```text
src/
├── pipeline/   pure. No fs, no Bun, no Electrobun. Rasterizes, composes, assembles.
├── bun/        the Electrobun shell: window, RPC, and all disk writes
├── cli/        headless entry point
├── host/       shared by bun + cli. May import anything.
├── shared/     shared by the host and the webview. Must stay webview-safe.
└── webview/    Preact UI. May import values only from webview, shared, and preact.
```

That last boundary is enforced, not conventional. A value import from the pipeline once
pulled `svgo`, `ico-endec` and `node:crypto` into the view — 1.88 MB that failed to load,
taking the drop handlers with it, so the symptom was "drag and drop doesn't work".
`no-restricted-imports` in `.oxlintrc.json` now rejects it at the import, with
`allowTypeImports` so type-only imports across the seam stay legal.

The pipeline stays pure because this app's output is pixels: a 4px Safe Zone error looks
fine in a preview while clipping someone's logo on a Pixel. Fourteen fixtures, plus a
committed hash for every file they produce, catch that — but only if the pipeline runs
headless.

**Never regenerate the goldens to make a red suite green.** `bun run goldens` is for when
you have decided the output *should* change.

## Docs

| Document | Covers |
| --- | --- |
| [CONTEXT.md](./CONTEXT.md) | domain vocabulary — Source Mark, Rendition, Safe Zone, Asset Bundle. Use these terms in code and commits. |
| [PRODUCT.md](./PRODUCT.md) | who it is for, the voice, the anti-references, the accessibility line |
| [DESIGN.md](./DESIGN.md) | the visual system: tokens, type scale, named rules |
| [docs/design-v1.md](./docs/design-v1.md) | why the output set is these seven files and not forty |
| [docs/implementation-plan.md](./docs/implementation-plan.md) | the phased build, with what went wrong at each step |
| [docs/phase-0-findings.md](./docs/phase-0-findings.md) | the spikes, and the measurements that settled them |

## Status

Feature-complete through the packaged build. Windows only — Electrobun supports macOS and
Linux, but nothing here has been run on either, and `src/bun/windows-dpi.ts` is explicitly
a no-op off Windows.
