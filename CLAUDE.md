# Manifesto — working notes

Drop an SVG, get every icon asset a website needs. Electrobun desktop app: a Bun process
owning the window and every filesystem touch, a Preact + Tailwind webview with none.

Read [README.md](./README.md) for what it does and how to run it. This file is the part
that is not obvious from the code.

## Design context

| Read this | Before |
| --- | --- |
| [CONTEXT.md](./CONTEXT.md) | writing any code or commit message — it defines Source Mark, Rendition, Treatment, Safe Zone, Asset Bundle, Sidecar. Use those words; they are load-bearing. |
| [PRODUCT.md](./PRODUCT.md) | writing user-facing copy, or adding a dependency to the view |
| [DESIGN.md](./DESIGN.md) | changing anything visual |

The short version of PRODUCT.md: the audience is developers who already know what a
maskable icon is but not this app's internals. Voice is **precise, quiet, trustworthy** —
plain and instructive, consequence before mechanism, every warning names an action. Four
anti-references: marketing-speak, enterprise/compliance tone, cutesy, and raw developer
output. Never let a library name or an internal type name reach the screen.

The short version of DESIGN.md: **"The Contact Sheet."** No type above 13px, no shadows,
1px borders, colour only ever reports a state. Dark mode is a nine-variable swap.

## Rules that cost real time when broken

**The view boundary is enforced by lint, not convention.** `src/webview/` and
`src/shared/` may not value-import from `src/pipeline/`, `src/bun/`, `src/cli/`,
`src/host/`, or `node:*`. Type-only imports are fine. This has broken twice, and both times
the symptom was *"drag and drop doesn't work"* — the module died on load and took the drop
guards with it. If you need a constant in the view, move it to `src/shared/`; if it needs
host code, it belongs in `src/host/`.

**The webview is served as a classic script**, not a module. Top-level await is a syntax
error there. Use an async IIFE.

**`src/pipeline/` must stay pure** — no `fs`, no Bun, no Electrobun. The caller supplies the
WASM bytes. This is what lets the golden hashes run headless, and they are the only thing
standing between a 4px Safe Zone error and someone's clipped logo.

**Never regenerate golden hashes to make a red suite green.** `bun run goldens` is for when
you have decided the output *should* change.

**`bun run check` is the gate**: format, lint (incl. type-aware), typecheck, test. Run it
before saying anything is done. `bun run app` additionally checks the built view bundle,
which catches what lint cannot — bulk arriving from dependencies.

**No non-null assertions.** `noUncheckedIndexedAccess` is on and `!` cancels it out. For
indexed reads into pixel buffers write `buf[i] ?? 0` — the fallback is unreachable when the
index is in range by construction, and for an alpha probe it also happens to mean exactly
the right thing.

## Things that look like bugs and are not

- **`process.cwd()` is `bin/`**, not the app root. Resolve bundled assets from
  `import.meta.dir`.
- **`process.on('beforeExit')` never fires** — Electrobun's quit path calls `forceExit`.
  Persist on change instead.
- **`BrowserWindow` has no resize or move event.** That is why the window frame is computed
  at startup rather than remembered.
- **The process must declare DPI awareness itself.** `launcher.exe` ships with no manifest,
  so without `src/bun/windows-dpi.ts` — which must run *first*, before any window exists —
  Windows bitmap-stretches the whole UI on any scaled display.
- **WebView2 ships overlay scrollbars.** A page with plenty to scroll looks like it has
  none until `::-webkit-scrollbar` is styled.
- **`electrobun/bun` re-exports `three` and `@babylonjs/core`.** A build plugin stubs them
  out; without it the main bundle is 9.7 MB instead of 1.2 MB.

## Verify, don't assume

This codebase was built by measuring: the alpha scan replaced `getBBox()` because
`getBBox()` was measured reporting a mark at 13.4% instead of 80.6%; the Safe Zone became a
circle because a fixture was measured escaping the box; `react-aria-components` was rejected
because it was measured at +170 kB. When a number matters, get it rather than estimate it —
and prefer deriving counts in code over typing them into prose, because a number in a
sentence has no test behind it.
