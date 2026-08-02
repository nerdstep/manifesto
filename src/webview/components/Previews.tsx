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

import { isDarkColor } from '../../shared/color.ts'
import { AndroidMaskable } from './MaskablePreview.tsx'
import {
  contrastInk,
  decodeUtf8,
  Panel,
  pngUrl,
  SquircleClipPath,
  TAB_CSS,
} from './preview-parts.tsx'

/**
 * A browser tab at true size.
 *
 * The favicon is inlined rather than put in an `<img>`, so the page's own CSS can force
 * which half of a dual-mode `favicon.svg` is showing. Inside an `<img>` the file obeys the
 * viewer's OS theme and both mocks would show the same mark — which would make the dark
 * mock a lie exactly when someone has supplied a Dark Mark to check.
 *
 * Duplicate element ids across the two copies are harmless here: the copies are the same
 * document, so any cross-reference resolves to an identical element.
 */
function TabMock({ svg, title, dark }: { svg: string; title: string; dark: boolean }) {
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
      <div
        class={`size-4 shrink-0 [&_svg]:size-full ${dark ? 'tab-dark' : 'tab-light'}`}
        // The markup is `favicon.svg`, which this app generated three lines of RPC ago
        // from an already-sanitized mark — `validate()` strips scripts and event handlers
        // before anything is composed.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <span class="truncate text-[11px]">{title}</span>
    </div>
  )
}

function BrowserTab({ faviconSvg, title }: { faviconSvg: string; title: string }) {
  return (
    <Panel
      title="Browser tab"
      note="favicon.svg at its true size, 16px. Shown on a light and a dark tab, because a dark-mode logo swaps between them."
    >
      <div class="space-y-2">
        <TabMock svg={faviconSvg} title={title} dark={false} />
        <TabMock svg={faviconSvg} title={title} dark />
      </div>
    </Panel>
  )
}

/** iOS home screen. The icon is 180px of bytes shown at the 60pt iOS actually draws. */
function IosHome({ png, label }: { png: string; label: string }) {
  return (
    <Panel
      title="iOS home screen"
      note="apple-touch-icon.png at the size iOS draws it. iOS turns transparency into black, so this file always gets a solid background."
    >
      <div class="flex items-center gap-3 rounded-lg bg-linear-to-b from-[#4a5568] to-[#2d3748] p-4">
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
    </Panel>
  )
}

/**
 * Android Chrome's toolbar, tinted with `theme_color`.
 *
 * This preview exists because Theme Color is otherwise invisible: it never touches a
 * Rendition, so nothing else on screen changes when you edit it, and the field reads like
 * it does nothing. Here it is doing the one thing it does.
 *
 * Android specifically — desktop browsers ignore `theme_color` entirely, so showing it on
 * the desktop tab mock above would be inventing behaviour that does not exist.
 */
function AndroidToolbar({
  svg,
  themeColor,
  title,
}: {
  svg: string
  themeColor: string
  title: string
}) {
  const onDark = isDarkColor(themeColor)

  return (
    <Panel
      title="Android address bar"
      note="theme_color tints the toolbar on Android Chrome. Desktop browsers ignore it, and it never appears inside an icon file."
    >
      <div class="overflow-hidden rounded-lg">
        <div
          class="flex items-center gap-2 px-3 py-2.5"
          style={{ background: themeColor, color: contrastInk(onDark) }}
        >
          <div
            class="size-4 shrink-0 [&_svg]:size-full tab-light"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <span class="truncate text-[11px]">{title}</span>
        </div>
        {/* A sliver of page below, so the tint reads as a bar rather than a swatch. */}
        <div class="h-8 bg-white" />
      </div>
    </Panel>
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
  const onDark = isDarkColor(background)

  return (
    <Panel
      title="PWA splash"
      note="background_color, shown while an installed web app starts. icon-512.png is transparent, so this is the color behind it."
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
        <span class="max-w-full truncate px-4 text-[13px]" style={{ color: contrastInk(onDark) }}>
          {name}
        </span>
      </div>
    </Panel>
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
    <section class="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
      <style>{TAB_CSS}</style>

      <SquircleClipPath />

      {maskable !== undefined && <AndroidMaskable png={maskable} />}
      {tabSvg !== null && <BrowserTab faviconSvg={tabSvg} title={name} />}
      {appleTouch !== undefined && <IosHome png={appleTouch} label={shortName} />}
      {tabSvg !== null && <AndroidToolbar svg={tabSvg} themeColor={themeColor} title={name} />}
      {icon512 !== undefined && (
        <PwaSplash png={icon512} background={splashBackground} name={name} />
      )}
    </section>
  )
}
