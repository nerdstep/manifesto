/** Generate platform-native app icons from the canonical logo.svg. */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { initWasm, Resvg } from '@resvg/resvg-wasm'
import icoEndec from 'ico-endec'

const root = join(import.meta.dir, '..')
const assets = join(root, 'assets')
const iconset = join(assets, 'app-icon.iconset')

const logo = await readFile(join(root, 'logo.svg'), 'utf8')
const wasm = await readFile(join(root, 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm'))

await initWasm(wasm)
await mkdir(iconset, { recursive: true })

function render(size: number): Uint8Array {
  const document = new Resvg(logo, { fitTo: { mode: 'width', value: size } })
  try {
    const image = document.render()
    try {
      return image.asPng()
    } finally {
      image.free()
    }
  } finally {
    document.free()
  }
}

const pngs = new Map<number, Uint8Array>()
for (const size of [16, 20, 24, 32, 40, 48, 64, 128, 256, 512, 1024]) {
  pngs.set(size, render(size))
}

function png(size: number): Uint8Array {
  const bytes = pngs.get(size)
  if (bytes === undefined) {
    throw new Error(`App icon size ${size} was not rendered`)
  }
  return bytes
}

// Cover Windows' large and small icon metrics at 100%, 125%, 150%, and 200% DPI.
const windowsIcon = icoEndec.encode(
  [16, 20, 24, 32, 40, 48, 64, 256].map((size) => Buffer.from(png(size))),
)
await writeFile(join(assets, 'app-icon.ico'), windowsIcon)
await writeFile(join(assets, 'app-icon.png'), png(512))

const macIcons = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
] as const

await Promise.all(macIcons.map(([filename, size]) => writeFile(join(iconset, filename), png(size))))

console.log('Generated Windows, macOS, and Linux app icons from logo.svg')
