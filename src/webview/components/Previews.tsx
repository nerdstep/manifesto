/**
 * The context previews.
 *
 * The governing rule: **show what the pipeline produced, not what Chromium thinks of the
 * source file.** Every preview here but one renders the base64 PNG bytes that were just
 * written to disk. Re-rendering the SVG in the webview would show a picture drawn by a
 * different rasterizer at a different size, which is precisely the class of error these
 * exist to catch — a Safe Zone breach looks fine in a preview that recomputed it.
 *
 * The tab preview is the deliberate exception, and for the same reason. In a real browser
 * tab the browser *is* the renderer, so rendering `favicon.svg` as SVG is the truthful
 * choice there.
 *
 * **Nothing is scaled up.** Each preview is shown at or below the size of the bytes
 * behind it. The 16px tab is the one that matters most and the one people never look at.
 *
 * Two of these panels — the Android address bar and the PWA splash — exist because Theme
 * Color and Splash Background touch no Rendition at all. Without a context showing where
 * they land, both fields read as if editing them does nothing.
 */

import { AndroidMaskable } from './MaskablePreview.tsx'
import {
  contrastInk,
  decodeUtf8,
  svgUrl,
  Tile,
  pngUrl,
  SquircleClipPath,
} from './preview-parts.tsx'

/**
 * A browser tab at true size.
 *
 * The favicon is rendered as an `<img>` so user-supplied SVG cannot become active markup in
 * the webview. Preview-only CSS is embedded into separate data URLs to force each half of a
 * dual-mode `favicon.svg` without exposing the application document to the file's DOM.
 *
 * Duplicate element ids across the two image documents are isolated by the browser.
 */
function TabMock({ src, title, dark }: { src: string; title: string; dark: boolean }) {
  return (
    <div
      class={[
        'flex items-center gap-2 rounded-t-lg border border-b-0 px-2.5 py-2',
        dark
          ? 'border-[#3c4043] bg-[#292a2d] text-[#e8eaed]'
          : 'border-[#dadce0] bg-white text-[#3c4043]',
      ].join(' ')}
    >
      {/* Exactly 16 CSS px. This is the whole point of this preview. */}
      <div class="size-4 shrink-0">
        <img src={src} alt="" width={16} height={16} />
      </div>
      <span class="truncate text-[11px]">{title}</span>
    </div>
  )
}

/**
 * Android Chrome's toolbar, tinted with `theme_color`.
 *
 * In the same card as the desktop tabs because all three answer one question — what a
 * browser shows — and because Theme Color is otherwise invisible: it never touches a
 * Rendition, so nothing else on screen changes when you edit it and the field reads like
 * it does nothing.
 *
 * Kept visually distinct from the tabs above it rather than merged into them: desktop
 * browsers ignore `theme_color` entirely, and tinting a desktop tab would be inventing
 * behaviour that does not exist.
 *
 * No sliver of white page beneath it. It was there so the tint would read as a bar rather
 * than a swatch, but the two tabs stacked above already establish that this is browser
 * chrome — and it assumed the user's site is white while being, on a near-black surface,
 * the brightest thing in the card.
 */
function AndroidBar({
  src,
  themeColor,
  title,
}: {
  src: string
  themeColor: string
  title: string
}) {
  return (
    <div class="overflow-hidden rounded-lg">
      <div
        class="flex items-center gap-2 px-2.5 py-2"
        style={{ background: themeColor, color: contrastInk(themeColor) }}
      >
        <div class="size-4 shrink-0">
          <img src={src} alt="" width={16} height={16} />
        </div>
        <span class="truncate text-[11px]">{title}</span>
      </div>
    </div>
  )
}

/**
 * Everything a browser shows: the favicon at 16px on a light tab and a dark tab, and the
 * Android toolbar tinted with `theme_color`.
 *
 * Three mocks in one card rather than two cards. They share a subject and a source file,
 * and splitting them cost a whole column for one strip of colour.
 */
function BrowserContexts({
  faviconSvg,
  title,
  themeColor,
}: {
  faviconSvg: string
  title: string
  themeColor: string
}) {
  const lightSrc = svgUrl(faviconSvg, false)
  const darkSrc = svgUrl(faviconSvg, true)

  return (
    <Tile
      title="Browser"
      dimensions="16×16"
      note="favicon.svg at 16 px on light and dark tabs. The bar uses Theme color in Android Chrome."
    >
      <div class="w-full space-y-2">
        <TabMock src={lightSrc} title={title} dark={false} />
        <TabMock src={darkSrc} title={title} dark />
        <AndroidBar src={lightSrc} themeColor={themeColor} title={title} />
      </div>
    </Tile>
  )
}

/** iOS home screen. The icon is 180px of bytes shown at the 60pt iOS actually draws. */
function IosHome({ png, label }: { png: string; label: string }) {
  return (
    <Tile
      title="iOS home screen"
      dimensions="180×180"
      note="apple-touch-icon.png at the size used on an iOS home screen. The file has a solid background because iOS turns transparency black."
    >
      <div class="flex items-center gap-3 rounded-lg bg-linear-to-b from-[#4a5568] to-[#2d3748] px-6 py-5">
        <div class="text-center">
          <img
            src={pngUrl(png)}
            alt="apple-touch-icon.png shown on a simulated iOS home screen, with rounded corners applied"
            width={60}
            height={60}
            // iOS's superellipse is close to 22.37% of the icon's width.
            class="block size-15 rounded-[22.37%] shadow-lg"
          />
          <span class="mt-1.5 block max-w-15 truncate text-[10px] text-white">{label}</span>
        </div>
      </div>
    </Tile>
  )
}

/**
 * The PWA launch splash: `background_color` behind `icon-512.png`.
 *
 * The other half of the invisible pair. Android draws exactly this while a standalone PWA
 * boots — the icon centred on `background_color`, the app name beneath it — and it is the
 * only place Splash Background is ever seen.
 *
 * Note the icon here is `icon-512.png`, which is **transparent**. That is the point: a
 * splash colour that disappears into the mark is a real failure mode, and it is only
 * visible in this context.
 */
function PwaSplash({ png, background, name }: { png: string; background: string; name: string }) {
  return (
    <Tile
      title="PWA splash"
      dimensions="512×512"
      note="Splash background shown while an installed web app starts. The transparent icon-512.png appears on top of it."
    >
      <div
        class="flex flex-col items-center justify-center gap-3 rounded-lg py-8"
        style={{ background }}
      >
        <img
          src={pngUrl(png)}
          alt="icon-512.png centered on the splash background color"
          width={96}
          height={96}
          class="block size-24"
        />
        <span
          class="max-w-full truncate px-4 text-[13px]"
          style={{ color: contrastInk(background) }}
        >
          {name}
        </span>
      </div>
    </Tile>
  )
}

export function Previews({
  files,
  name,
  shortName,
  themeColor,
  splashBackground,
}: {
  files: Record<string, string>
  name: string
  shortName: string
  themeColor: string
  splashBackground: string
}) {
  const faviconSvg = files['favicon.svg']
  const appleTouch = files['apple-touch-icon.png']
  const maskable = files['icon-maskable-512.png']
  const icon512 = files['icon-512.png']
  const tabSvg = faviconSvg === undefined ? null : decodeUtf8(faviconSvg)

  return (
    <section class="mt-5 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
      <SquircleClipPath />

      {maskable !== undefined && <AndroidMaskable png={maskable} />}
      {tabSvg !== null && (
        <BrowserContexts faviconSvg={tabSvg} title={name} themeColor={themeColor} />
      )}
      {appleTouch !== undefined && <IosHome png={appleTouch} label={shortName} />}
      {icon512 !== undefined && (
        <PwaSplash png={icon512} background={splashBackground} name={name} />
      )}
    </section>
  )
}
