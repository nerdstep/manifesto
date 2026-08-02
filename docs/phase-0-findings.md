# Phase 0 — spike findings

Environment: Bun 1.3.14, Node 25.8.0, Windows 11 Pro 26200.
Packages: `@resvg/resvg-wasm@2.6.2`, `ico-endec@0.1.6`, `electrobun@1.18.1`.

**Verdict: all three spikes resolved. One structural amendment to the plan
(Normalization must not use `getBBox()`), plus three footguns worth knowing.**

---

## 0.1 — Bounding box for Normalization

### `getBBox()` exists, and must not be used

The API is present in the WASM build (`getBBox`, `innerBBox`, `cropByBBox`) and returns
correct values for clean fixtures. **But it reports the _layout_ box, not the _painted_
box**, and invisible geometry inflates it. Painted content in every case below is a
circle at `30,30 40x40`:

| Extra element in the document | `getBBox()` | Verdict |
| --- | --- | --- |
| _(nothing)_ | `30 30 40x40` | ok |
| `<image href="https://…">` (unresolvable) | `0 0 100x100` | **inflated** |
| `<rect fill="none">` | `0 0 100x100` | **inflated** |
| `<rect opacity="0">` | `0 0 100x100` | **inflated** |
| `<rect fill-opacity="0">` | `0 0 100x100` | **inflated** |
| `<rect visibility="hidden">` | `0 0 100x100` | **inflated** |
| `<rect fill="transparent">` | `0 0 100x100` | **inflated** |
| `<rect display="none">` | `30 30 40x40` | ok |
| rect inside `<defs>` | `30 30 40x40` | ok |
| empty `<g>`, `<title>`, `<desc>` | `30 30 40x40` | ok |

This is not an edge case. **Figma and Illustrator routinely emit a transparent or
`fill="none"` bounding rect to lock the export frame** — which is precisely the padded
export that Normalization exists to correct, and `getBBox()` is blind to it.

Measured damage on `external-image.svg`: the mark occupied **13.4%** of a Rendition
instead of **80.6%**. A 6× size error, silent, with no warning anywhere.

### The fix: alpha-scan the painted pixels

Render the Source Mark once at a probe resolution, scan the alpha channel for extents,
and express those in document viewport pixels. This is ground truth by construction —
it measures what is actually painted.

| fixture | `getBBox()` | alpha scan | actually painted |
| --- | --- | --- | --- |
| `square-tight` | `0 0 100x100` | `0 0 100x100` | ✓ |
| `square-padded` | `250 250 500x500` | `250 250 500x500` | ✓ |
| `external-image` | `0 0 100x100` | **`30 30 40x40`** | ✓ |
| `wordmark` | `0 100 1000x100` | `0 99.7 1000x100.7` | ✓ |

**Cost: 7.7 ms per probe at 1024px** — once per Source Mark, not per Rendition.
Irrelevant against a 150 ms debounce.

As a bonus this collapses three problems into one code path: an empty mark, a text-only
mark, and a mark of purely invisible geometry all yield _no painted pixels_ → one clean
guarded error, instead of `getBBox()` returning `undefined` and `cropByBBox` throwing
`expected instance of _BBox` somewhere downstream.

### CORRECTION (Phase 3): the byte-identity result below was fixture luck

The table in the next section is **wrong as a general claim**, and Phase 3 disproved it
with better fixtures.

The alpha probe is 1024px across the document, so a 1000-unit canvas quantizes to ~0.98
units per probe pixel. This spike's `square-padded` fixture put its mark at 250–750 of
1000, and `250/1000 × 1024 = 256` **exactly** — the extents happened to land on probe
pixel boundaries, so they were measured perfectly. Phase 3's fixture uses 320–680, and
`320/1000 × 1024 = 327.68` does not, giving a measured extent of `319.3 361.3` against a
true `320 360`.

Real numbers with an honest fixture: 0% differing at 16/32/48, then 1.3% at 180, 1.6% at
192, 0.9% at 512, 0.5% at maskable.

**Byte-identity across differently-scaled documents is not achievable with a raster
probe, and should never have been the DoD.** What is achievable, and what Phase 3
asserts instead:

- fixtures sharing a canvas and differing only in invisible geometry are **byte-identical**
  (this is the assertion that actually catches the `getBBox()` bug)
- differently-scaled exports land within **1 output pixel** on every edge, with painted
  area within 3%

A refinement pass would cut quantization ~3×, but for a 0.27% scale difference nobody
can see it is not worth doubling the cost of measurement.

### The (over-stated) original result

Normalization = alpha-scan extents + a canonical `viewBox="0 0 1000 1000"` wrapper with
the original `<svg>` **nested verbatim**. `square-tight` vs `square-padded`:

| Rendition | Result |
| --- | --- |
| `favicon.ico` 16 / 32 / 48 | **identical** |
| `apple-touch-icon` 180 | **identical** |
| `icon-192` | **identical** |
| `icon-512` | **identical** |
| `icon-maskable-512` | differs 96/262144 = **0.037%**, maxΔ 53 |

Compare the earlier `getBBox()`-based approach, which differed by **2.73% at 16px**.

**Safe Zone verified numerically:** for the maskable Rendition at inset 0.2, **0.00%** of
painted pixels fall outside the centre 80% circle.

**Determinism verified:** identical input renders to identical bytes across repeated
runs, so golden-hash regression testing is sound.

### Footgun: don't round-trip through `toString()`

resvg's serializer emits `xlink:href` **without declaring the xlink namespace**, so its
own output fails to re-parse for any mark containing an `<image>`:

```sh
error: SVG data parsing failed cause an unknown namespace prefix 'xlink' at 3:49
```

Nest the original `<svg>` element verbatim (forcing only explicit `width`/`height`)
rather than serializing and re-parsing. This preserves the source's own `xmlns`
declarations and avoids the bug entirely.

### Rejected: rewriting path data for bit-identity

`cropByBBox` + `toString()` leaves path coordinates in their original space and keeps
the transform as `matrix(...)` on a `<g>`, so differently-scaled sources antialias
differently. Rewriting `d` coordinates in JS would give bit-identity — the parser is easy
since resvg emits only absolute `M/C/L/Z` — but it means owning SVG coordinate
transformation correctly: `stroke-width`, `stroke-dasharray`, `userSpaceOnUse`
gradients, clip paths, masks. Not worth it, especially now that the nested-svg approach
reaches identical output on 6 of 7 Renditions anyway.

### Also confirmed

- **External `<image href>` cannot cause network access.** With `fetch` trapped to
  throw, rendering succeeded with **zero** fetch calls. resvg-wasm never resolves remote
  refs; it reports them via `imagesToResolve()` and waits for `resolveImage()`. We owe
  the user a _report_, not a defence. And since the alpha scan ignores unpainted
  geometry, no stripping is needed for correctness either.
- **`background` render option ≡ a wrapper `<rect>`** — byte-identical. The wrapper
  `<rect>` stays, since it composes with the inset transform in one document.

---

## 0.2 — `ico-endec` output format

**PNG-embedded ICO, correctly formed. Adopted as-is; no fallback needed.**

```sh
source png 16px = 301 bytes / 32px = 580 / 48px = 842
encoded .ico    = 1777 bytes
header: type=1 (ICO) count=3
entry 0: 16x16 bpp=8 size=301 offset=54  format=PNG
entry 1: 32x32 bpp=8 size=580 offset=355 format=PNG
entry 2: 48x48 bpp=8 size=842 offset=935 format=PNG
decode() round-trip → 16x16/png, 32x32/png, 48x48/png
```

Aside: `electrobun` itself depends on `png-to-ico` for app icons, so an ICO encoder is
in the tree regardless.

---

## 0.3 — Electrobun round-trip

**Confirmed end to end.** Live log from the running app:

```sh
drop guards registered ✓
Electroview constructed ✓
wasm LOADED  …\SpikeEB-dev\Resources\app\resvg.wasm
DROP EVENT FIRED — files=1  types=["Files"]
  file: name="external-image.svg" type="image/svg+xml" size=232
  read 232 chars as text ✓
  ROUND-TRIP OK — 2600b png, bun 18.66ms, total 28ms
```

OS file drop → `File` → `file.text()` → RPC → resvg → base64 → `<img>` all work. The
webview needs no filesystem access. **28 ms round trip** confirms live debounced
regeneration is comfortable.

### Footgun: the webview's default file-drop behaviour opens the file

A dropped file navigates/opens unless `preventDefault()` is registered on **`document`
and `window`, in the capture phase, for all four drag events**. Cancelling only on the
drop target is not enough — a drop landing anywhere else still triggers it.

Register the guards **before any code that can throw**. The first failure here presented
as "Electrobun doesn't support file drop", when in fact a TypeError on line 4 had killed
the module before any listener was registered.

Use `preventDefault()` only — adding `stopPropagation()` in the capture phase starves
the real bubble-phase handler.

### Footgun: `electrobun/view`'s default export is a namespace object

```ts
const Electrobun = { Electroview };
export default Electrobun;          // NOT the class
```

`import Electroview from "electrobun/view"` then `Electroview.defineRPC(...)` throws.
Use the **named** import: `import { Electroview } from "electrobun/view"`.

Corollary worth building in from the start: a webview `window.onerror` handler that
paints failures into the UI. Without one, a script that dies on line 4 is
indistinguishable from a framework limitation.

### Footgun: `process.cwd()` is not the app root

```txt
import.meta.dir = …\SpikeEB-dev\Resources\app\bun
process.cwd()   = …\SpikeEB-dev\bin           ← not the app root
```

Resolve bundled assets from `import.meta.dir`, never `process.cwd()`.

### Bundling a binary asset works

```ts
copy: {
  "src/webview/index.html": "views/mainview/index.html",
  "node_modules/@resvg/resvg-wasm/index_bg.wasm": "resvg.wasm",
}
```

lands at `Resources/app/resvg.wasm`; load with `join(import.meta.dir, "..", "resvg.wasm")`.

### RPC is JSON-over-WebSocket, AES-GCM encrypted per webview

Payloads are `JSON.parse`/`stringify`'d, so **binary cannot cross raw — base64 is the
only option**, not a size trade-off. `Map<string, Uint8Array>` stays the pure function's
signature (right for disk writes and tests); the Bun shell converts to
`Record<string, string>` at the boundary.

### Bundle size — flag for Phase 8

Dev build is **127.6 MB**; `Resources/app/bun/index.js` alone is **9.1 MB** for ~80 lines
of app code. The `electrobun/bun` barrel re-exports `three` and `@babylonjs/core`, which
are runtime dependencies of the package. Release artifacts compress, but if the
advertised 14 MB matters, try importing from deeper paths
(`electrobun/bun/core/BrowserWindow`) instead of the barrel.
