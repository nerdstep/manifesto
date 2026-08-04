import { AndroidMaskable } from './MaskablePreview.tsx'
import {
  contrastInk,
  decodeUtf8,
  svgUrl,
  Tile,
  pngUrl,
  SquircleClipPath,
} from './preview-parts.tsx'

/** Render favicons as image documents so their SVG cannot enter the application DOM. */
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
      <div class="size-4 shrink-0">
        <img src={src} alt="" width={16} height={16} />
      </div>
      <span class="truncate text-[11px]">{title}</span>
    </div>
  )
}

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
            class="block size-15 rounded-[22.37%] shadow-lg"
          />
          <span class="mt-1.5 block max-w-15 truncate text-[10px] text-white">{label}</span>
        </div>
      </div>
    </Tile>
  )
}

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
