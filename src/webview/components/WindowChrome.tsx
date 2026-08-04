import type { ComponentType } from 'preact'

import { desktopPlatform, supportsCustomWindowChrome } from '../../shared/window-chrome.ts'
import type { CustomChromePlatform, DesktopPlatform } from '../../shared/window-chrome.ts'
import { bun } from '../rpc.ts'

export type WindowChromeProps = {
  /** Override platform detection for tests and future host adapters. */
  platform?: DesktopPlatform
}

function WindowsWindowChrome() {
  return (
    <div
      class="electrobun-webkit-app-region-drag relative z-10 h-9 shrink-0 border-b border-line bg-bg select-none"
      onDblClick={() => {
        bun().send.toggleMaximizeWindow()
      }}
    >
      <div class="flex h-full items-center gap-2 px-3 pr-36">
        <img
          alt=""
          aria-hidden="true"
          class="size-4 shrink-0"
          src="views://mainview/app-icon.png"
        />
        <span class="text-sm font-semibold text-muted">Manifesto</span>
      </div>

      <div class="electrobun-webkit-app-region-no-drag absolute top-0 right-0 flex h-full">
        <button
          aria-label="Minimize window"
          class="flex w-11 items-center justify-center text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan active:bg-line"
          onClick={() => {
            bun().send.minimizeWindow()
          }}
          type="button"
        >
          <svg aria-hidden="true" class="size-3" viewBox="0 0 12 12">
            <path d="M2 8.5h8" fill="none" stroke="currentColor" />
          </svg>
        </button>
        <button
          aria-label="Maximize window"
          class="flex w-11 items-center justify-center text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan active:bg-line"
          onClick={() => {
            bun().send.toggleMaximizeWindow()
          }}
          type="button"
        >
          <svg aria-hidden="true" class="size-3" viewBox="0 0 12 12">
            <rect x="2.25" y="2.25" width="7.5" height="7.5" fill="none" stroke="currentColor" />
          </svg>
        </button>
        <button
          aria-label="Close window"
          class="flex w-11 items-center justify-center text-muted transition-colors hover:bg-bad hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan active:bg-bad/80"
          onClick={() => {
            bun().send.closeWindow()
          }}
          type="button"
        >
          <svg aria-hidden="true" class="size-3" viewBox="0 0 12 12">
            <path d="m2.25 2.25 7.5 7.5m0-7.5-7.5 7.5" fill="none" stroke="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  )
}

const CHROME_BY_PLATFORM: Record<CustomChromePlatform, ComponentType> = {
  windows: WindowsWindowChrome,
}

export function WindowChrome({
  platform = desktopPlatform(globalThis.navigator?.userAgent ?? ''),
}: WindowChromeProps) {
  if (!supportsCustomWindowChrome(platform)) return null

  const Chrome = CHROME_BY_PLATFORM[platform]
  return <Chrome />
}
