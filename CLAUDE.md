# Manifesto

Read [README.md](./README.md) for what it does and how to run it.

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

## General rules

Run `bun run check` to execute format, lint, typecheck, and test. Run it before calling
anything done.

Run `bun run app` to check the built view bundle.

## Language rules

- When writing something intended for human consumption, (comment, commit message, reply to prompt) use as few words as possible. Pick every word meticulously to reduce the volume to a strict minimum. Be down to the point. Less is more.

- Avoid superlatives and praise. Stop telling me I am absolutely right. Give me the cold hard truth.

## Code rules

- Avoid magic numbers and strings by extracting recurring or meaningful values into descriptive constants (const) or enums. Keep self-explanatory, one-off values inline to avoid clutter. If a value comes from a spec (e.g. HTTP 200 OK), use a constant regardless.

- Add a small, to the point, comment to explain *what* the block does and *why*. Use examples when possible. Propose ASCII drawings to explain complete systems.

- Treat member visibility changes as a breaking design shift. Keep all fields and functions private unless external access is strictly required by the design. Prompt the user for explicit approval before changing any access modifier from private to internal or public.

- Program to levels of abstraction. Lower-level mechanics must be encapsulated in a dedicated abstraction layer. Expose clean, high-level APIs to the rest of the application so calling code works with domain concepts, not raw implementation details.

- Don't touch blocks of code unrelated to the feature you implement. e.g. Don't add comments to a block of code if you did not create it or modify it. As much as possible try to minimize the number of changed lines when implementing a feature.

- Strictly adhere to the layered boundary hierarchy: each layer may only communicate with its immediate neighbor directly below it. Never "punch holes" through layers (e.g., controllers or UI components must never directly call database queries, or low-level network clients; always route through the intermediate service/abstraction layer).

## Commit rules

When you write a commit message, follow these 7 rules:
Rule 1: Follow conventional commit syntax for Release Please:
        - `fix:` creates a patch release, `feat:` a minor release
        - `docs:`, `chore:`, or `ci:` for non-releasable changes
Rule 2: Limit the subject line to 50 characters (72 is the absolute hard limit).
Rule 3: Capitalize the first letter of the subject line.
Rule 4: Do not end the subject line with a period.
Rule 5: Use the imperative mood in the subject line (e.g., "Fix bug," "Add feature,"
        not "Fixed" or "Adds"). Test formula: It must complete the sentence: "If applied,
        this commit will [your subject line here]".
Rule 6: Wrap the body text manually at 72 characters to prevent Git formatting issues.
Rule 7: Use the body to explain what and why vs. how. Assume the code explains the how;
        the message must explain the context and reasoning.

## Project rules

**The Electrobun SDK is not in `node_modules`.** Hutch projects it into `.hutch/devkit`
(gitignored) and `tsconfig.json` maps `electrobun/*` by hand, because the devkit's own
tsconfig uses `baseUrl`, which TypeScript 7 removed. After a fresh clone or version bump run
`bunx electrobun prepare` (builds do it implicitly). `test/devkit-paths.test.ts` holds those
paths.

**`src/pipeline/` must stay pure** — no `node:fs`, no `node:path`, no Electrobun, nothing
from `src/bun/`; the caller supplies the WASM bytes. `test/pipeline-purity.test.ts` enforces
that list. Purity is what lets the golden hashes run headless, and they are the only thing
standing between a 4px Safe Zone error and someone's clipped logo. `node:crypto` is allowed
(`hashSource`); `Bun.CryptoHasher` is ~18% faster but would pin the pipeline to one runtime
to save 0.06 ms per generate — the trade paid off when the main process moved to Cottontail
and all 126 golden hashes stayed byte-identical. Prefer `node:` builtins in `src/pipeline/`,
`src/host/`, and `src/bun/`; `src/cli/`, `scripts/`, and tests run on Bun and may use `Bun.*`.

**Never regenerate golden hashes to make a red suite green.** `bun run goldens` is for when
you have decided the output *should* change.

## Things that look like bugs and are not

- **`process.cwd()` is `bin/`.** Resolve bundled assets from `import.meta.dir`.
- **`process.on('beforeExit')` never fires** — Electrobun's quit path calls `forceExit`.
  Persist on change instead.
- **`BrowserWindow` has no resize or move event.** That is why the window frame is computed
  at startup rather than remembered.
- **`BrowserWindow`'s frame is in points, not physical pixels.** Electrobun applies the
  display scale itself, so `windowFrame` passes the intended size straight through.
  Scaling it first applies the scale twice: a 1280x880 window opened at 2880x1980 physical
  with a 1920x1320 CSS viewport — a window half again too big whose content looked two
  thirds size.
- **A `titleBarStyle: 'hidden'` window has no sizing border.** Measured by reading
  `GWL_STYLE` off the running app: `0x94000000`, which is `WS_POPUP | WS_VISIBLE |
  WS_CLIPSIBLINGS` with no `WS_THICKFRAME`. Electrobun's `Resizable: true` style mask does
  not survive the frameless path on Windows, so there is no non-client area to drag and
  resizing has to come from the view — see `WindowResize.tsx`.
- **A pointer event's `screenX`/`screenY` are already in points.** Measured with the window
  at `640,256 1280x880` points on a 2560x1440 display at 1.5x: the webview reported
  `screenX=640`, `innerWidth=1280`, `devicePixelRatio=1.5`. WebView2 reports screen
  coordinates in CSS pixels, and `BrowserWindow` wants points, so a resize drag needs no
  scale conversion. Multiplying by `devicePixelRatio` makes the window resize half again
  too fast.
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

This codebase was built by measuring: the alpha scan replaced `getBBox()` (measured reporting
a mark at 13.4% instead of 80.6%); the Safe Zone became a circle after a fixture was measured
escaping the box; `react-aria-components` was rejected at +170 kB. Get the number rather than
estimate it, and prefer deriving counts in code — a number in a sentence has no test behind it.
