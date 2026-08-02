// ============================================================================
// REFERENCE PROTOTYPE — not production code, not wired into the app.
//
// This is spike 0.1f from Phase 0, kept because it is a *validated* implementation
// of alpha-scan Normalization. Phase 3's `src/pipeline/normalize.ts` and
// `compose.ts` should follow this shape. See `docs/phase-0-findings.md` for the
// measurements.
//
// Verified by this script:
//   - painted extents match ground truth for every fixture, including one whose
//     getBBox() is inflated by an unresolvable <image>
//   - square-tight and square-padded produce byte-identical Renditions at
//     16/32/48/180/192/512, and differ by 0.037% at maskable
//   - 0.00% of maskable painted pixels fall outside the centred 80% Safe Zone
//   - a mark that paints nothing yields null, i.e. the hard-error path
//   - the probe costs ~7.7 ms at 1024px
//
// Two things it deliberately does NOT do, both learned the hard way:
//   - it never calls getBBox(), which reports the LAYOUT box and is inflated by
//     invisible geometry (fill="none", opacity="0", unresolved <image>, …)
//   - it never re-parses Resvg.toString() output, whose serializer emits
//     xlink:href without declaring the namespace
//
// Paths below assume the old spike/ layout and need adjusting to run.
// ============================================================================

import { createHash } from 'node:crypto'

import { initWasm, Resvg } from '@resvg/resvg-wasm'

await initWasm(await Bun.file('./node_modules/@resvg/resvg-wasm/index_bg.wasm').arrayBuffer())

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex').slice(0, 16)

const PROBE = 1024 // alpha-scan resolution
const CANON = 1000 // canonical coordinate space

type Extent = { x: number; y: number; w: number; h: number }

/**
 * Painted extents in the document's own VIEWPORT pixels (0..docW, 0..docH).
 *
 * Deliberately does NOT round-trip through resvg's toString(): its serializer emits
 * `xlink:href` without declaring the xlink namespace, so its own output fails to
 * re-parse ("unknown namespace prefix 'xlink'") for any mark containing an <image>.
 * Nesting the original <svg> verbatim avoids serialization entirely.
 */
function paintedExtents(svg: string): Extent | null {
  const doc = new Resvg(svg)
  const docW = doc.width
  const docH = doc.height

  const img = new Resvg(svg, { fitTo: { mode: 'width', value: PROBE } }).render()
  const { width: iw, height: ih, pixels } = img

  let minX = iw,
    minY = ih,
    maxX = -1,
    maxY = -1
  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      if (pixels[(y * iw + x) * 4 + 3] !== 0) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null // nothing painted at all

  const sx = docW / iw
  const sy = docH / ih
  return {
    x: minX * sx,
    y: minY * sy,
    w: (maxX - minX + 1) * sx,
    h: (maxY - minY + 1) * sy,
  }
}

/** Normalize into a canonical square, then apply a Treatment and rasterize. */
function render(
  svg: string,
  { size, background, inset }: { size: number; background?: string; inset: number },
) {
  const e = paintedExtents(svg)
  if (!e) throw new Error('nothing painted')

  const probe = new Resvg(svg)
  const docW = probe.width
  const docH = probe.height

  // Nest the ORIGINAL <svg> element verbatim, only forcing explicit width/height so
  // the nested viewport is sized in document pixels. Keeping the element intact
  // preserves its own xmlns declarations (xlink et al).
  const nested = svg
    .replace(/^\s*<\?xml[\s\S]*?\?>/, '')
    .replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
      const cleaned = attrs
        .replaceAll(/\s(width|height|x|y)\s*=\s*"[^"]*"/g, '')
        .replaceAll(/\s(width|height|x|y)\s*=\s*'[^']*'/g, '')
      return `<svg${cleaned} x="0" y="0" width="${docW}" height="${docH}">`
    })

  const box = CANON * (1 - 2 * inset) // available square for the mark
  const scale = box / Math.max(e.w, e.h)
  const tx = CANON * inset + (box - e.w * scale) / 2 - e.x * scale
  const ty = CANON * inset + (box - e.h * scale) / 2 - e.y * scale

  const doc =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANON} ${CANON}">` +
    (background ? `<rect width="${CANON}" height="${CANON}" fill="${background}"/>` : '') +
    `<g transform="translate(${tx} ${ty}) scale(${scale})">${nested}</g>` +
    `</svg>`

  return new Resvg(doc, { fitTo: { mode: 'width', value: size } }).render()
}

function paintedPct(img: { pixels: Uint8Array }) {
  let n = 0
  for (let i = 3; i < img.pixels.length; i += 4) if (img.pixels[i] !== 0) n++
  return (n / (img.pixels.length / 4)) * 100
}

function diff(a: Uint8Array, b: Uint8Array) {
  let d = 0,
    max = 0
  for (let i = 0; i < a.length; i += 4) {
    let m = 0
    for (let c = 0; c < 4; c++) m = Math.max(m, Math.abs(a[i + c]! - b[i + c]!))
    if (m > 0) d++
    max = Math.max(max, m)
  }
  return { d, total: a.length / 4, pct: (d / (a.length / 4)) * 100, max }
}

const fx = (n: string) => Bun.file(`./fixtures/${n}.svg`).text()

// ---------------------------------------------------------------------------
console.log('Painted extents — alpha scan vs getBBox()\n')
console.log('fixture             getBBox()            alpha scan')
console.log('-'.repeat(70))
for (const n of ['square-tight', 'square-padded', 'external-image', 'wordmark']) {
  const svg = await fx(n)
  const g = new Resvg(svg).getBBox()
  const e = paintedExtents(svg)
  console.log(
    `${n.padEnd(20)}${(g ? `${g.x.toFixed(1)} ${g.y.toFixed(1)} ${g.width.toFixed(1)}x${g.height.toFixed(1)}` : 'undefined').padEnd(21)}` +
      `${e ? `${e.x.toFixed(1)} ${e.y.toFixed(1)} ${e.w.toFixed(1)}x${e.h.toFixed(1)}` : 'null'}`,
  )
}

// ---------------------------------------------------------------------------
console.log('\n\nDoes the mark fill the Rendition correctly now?')
console.log("(icon-512 'any' Treatment: no background, inset 0)\n")
for (const n of ['square-tight', 'square-padded', 'external-image']) {
  const img = render(await fx(n), { size: 512, inset: 0 })
  console.log(
    `  ${n.padEnd(20)} ${paintedPct(img).toFixed(1)}% painted   (circle in a square ≈ 78.5%)`,
  )
}

// ---------------------------------------------------------------------------
console.log('\n\ntight vs padded equivalence, per Rendition:\n')
for (const [label, opts] of [
  ['favicon 16      ', { size: 16, inset: 0 }],
  ['favicon 32      ', { size: 32, inset: 0 }],
  ['favicon 48      ', { size: 48, inset: 0 }],
  ['apple-touch 180 ', { size: 180, inset: 0.1, background: '#FFFFFF' }],
  ['icon-192        ', { size: 192, inset: 0 }],
  ['icon-512        ', { size: 512, inset: 0 }],
  ['maskable 512    ', { size: 512, inset: 0.2, background: '#FFFFFF' }],
] as const) {
  const a = render(await fx('square-tight'), opts as any)
  const b = render(await fx('square-padded'), opts as any)
  const r = diff(a.pixels, b.pixels)
  const same = sha(a.asPng()) === sha(b.asPng())
  console.log(
    `  ${label} ${same ? 'IDENTICAL ✓' : `differs ${r.d}/${r.total} (${r.pct.toFixed(3)}%) maxDelta=${r.max}`}`,
  )
}

// ---------------------------------------------------------------------------
console.log('\n\nSafe Zone check — maskable 512, mark must sit inside centre 80% circle:')
{
  const img = render(await fx('square-tight'), {
    size: 512,
    inset: 0.2,
    background: undefined as any,
  })
  const cx = 256,
    cy = 256,
    rSafe = 512 * 0.4
  let outside = 0,
    painted = 0
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      if (img.pixels[(y * 512 + x) * 4 + 3] === 0) continue
      painted++
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > rSafe) outside++
    }
  console.log(
    `  painted=${painted}  outside safe circle=${outside} (${((outside / painted) * 100).toFixed(2)}%)`,
  )
}

// ---------------------------------------------------------------------------
console.log('\n\nEmpty-mark guard:')
for (const n of ['with-text']) {
  const e = paintedExtents(await fx(n))
  console.log(`  ${n}: paintedExtents = ${e === null ? 'null → hard error ✓' : JSON.stringify(e)}`)
}

console.log('\n\nCost of the alpha-scan probe:')
{
  const svg = await fx('square-padded')
  const t0 = performance.now()
  for (let i = 0; i < 10; i++) paintedExtents(svg)
  console.log(`  ${((performance.now() - t0) / 10).toFixed(1)} ms per probe @ ${PROBE}px`)
}
