# Manifesto — working notes

Drop an SVG, get every icon asset a website needs. Electrobun desktop app: a Bun process
owning the window and every filesystem touch, a Preact + Tailwind webview with none.

Read [README.md](./README.md) for what it does and how to run it. This file is the part
that is not obvious from the code.

## Agent skills

### Issue tracker

Issues and specs are tracked as local Markdown under `.scratch/`; external PRs are not a
triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The canonical triage labels use their default names. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository with `CONTEXT.md` and `docs/adr/` at the root. See
`docs/agents/domain.md`.

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
error there. Use an async IIFE. `format: 'iife'` in `electrobun.config.ts` is what pins
this, and `bun run check:bundle` parses the built view to prove it.

**The Electrobun SDK is not in `node_modules`.** Electrobun 2 ships a bootstrap package;
Hutch projects the real SDK into `.hutch/devkit` (gitignored) and `tsconfig.json` maps the
`electrobun/*` specifiers onto it by hand — the devkit's own generated tsconfig maps with
`baseUrl`, which TypeScript 7 removed. After a fresh clone or an `electrobun` version bump,
run `bunx electrobun prepare`; every build does it implicitly. `test/devkit-paths.test.ts`
holds those hand-written paths to the devkit's export map.

**Ask Electrobun for the display, never Windows.** `Screen.getPrimaryDisplay()` reports
`bounds` and `workArea` in points and a separate `scaleFactor`. The app used to read
user32 through `bun:ffi` instead, which returned physical pixels and knew nothing about the
taskbar. Points are what `BrowserWindow` wants, so nothing needs converting.

**`src/pipeline/` must stay pure** — no `node:fs`, no `node:path`, no Electrobun, and
nothing from `src/bun/`. The caller supplies the WASM bytes. `test/pipeline-purity.test.ts`
enforces exactly that list. This is what lets the golden hashes run headless, and they are
the only thing standing between a 4px Safe Zone error and someone's clipped logo.

`node:crypto` is allowed and used, for `hashSource`. `Bun.CryptoHasher` is ~18% faster and
would also pass the test, but it pins the pipeline to one runtime to save 0.06 ms once per
generate. Prefer `node:` builtins here; prefer `Bun.*` freely in `src/bun/`, `src/cli/`,
`scripts/`, and tests.

**Never regenerate golden hashes to make a red suite green.** `bun run goldens` is for when
you have decided the output *should* change.

**`bun run check` is the gate**: format, lint (incl. type-aware), typecheck, test. Run it
before saying anything is done. `bun run app` additionally checks the built view bundle,
which catches what lint cannot — bulk arriving from dependencies.

**Release plumbing is `chore:` or `ci:`, never `fix:` or `feat:`.** Release Please reads
these commits, so `fix:` cuts a patch and `feat:` a minor. A workflow, `release-please-config.json`,
or `.oxfmtrc.json` change that ships no application code still produced a spurious 0.2.1
this way. Ask whether the change alters what users run: if it only alters how the project is
built, checked, or released, it is not a `fix`. `docs:` is safe — non-releasable, no
changelog entry. There is no correcting this after the fact; `main` sets `non_fast_forward`
and `required_linear_history`, so the version is cut and stays cut.

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
- **`BrowserWindow`'s frame is in points, not physical pixels.** Electrobun applies the
  display scale itself, so `windowFrame` passes the intended size straight through.
  Scaling it first applies the scale twice: a 1280x880 window opened at 2880x1980 physical
  with a 1920x1320 CSS viewport — a window half again too big whose content looked two
  thirds size.
- **Electrobun 2 sets per-monitor DPI awareness itself**, before any app code runs —
  measured by removing the app's own `SetProcessDpiAwarenessContext` call and still
  reading 1.5x. The process needs no manifest and no FFI to be DPI aware.
- **WebView2 ships overlay scrollbars.** A page with plenty to scroll looks like it has
  none until `::-webkit-scrollbar` is styled.
- **`bun run dist` needs Windows' `tar`, not Git Bash's.** Hutch shells out to `tar`, and
  GNU tar reads the `C:\...` it is handed as a remote host: *"Cannot connect to C: resolve
  failed"*. Run `dist` from PowerShell, where `tar` is `System32	ar.exe`. The same trap is
  why `scripts/check-package.ts` extracts with relative paths.

## Verify, don't assume

This codebase was built by measuring: the alpha scan replaced `getBBox()` because
`getBBox()` was measured reporting a mark at 13.4% instead of 80.6%; the Safe Zone became a
circle because a fixture was measured escaping the box; `react-aria-components` was rejected
because it was measured at +170 kB. When a number matters, get it rather than estimate it —
and prefer deriving counts in code over typing them into prose, because a number in a
sentence has no test behind it.
