import type { TargetedPointerEvent } from 'preact'
import { useMemo } from 'preact/hooks'

import { supportsCustomWindowChrome } from '../../shared/window-chrome.ts'
import type { DesktopPlatform } from '../../shared/window-chrome.ts'
import { RESIZE_EDGES } from '../../shared/window-frame.ts'
import type { ResizeEdge } from '../../shared/window-frame.ts'
import { bun } from '../rpc.ts'
import { cn } from '../utils/index.ts'
import { createWindowResize } from '../window-resize.ts'
import type { WindowResizeHost } from '../window-resize.ts'
import { chromePlatform } from './WindowChrome.tsx'

/**
 * Sizing borders for a window that has none.
 *
 * A `titleBarStyle: 'hidden'` window on Windows is created `WS_POPUP` without
 * `WS_THICKFRAME` — measured by reading `GWL_STYLE` off the running app, which comes back
 * `0x94000000`. Electrobun's `Resizable: true` style mask does not survive the frameless
 * path, so there is no non-client area to grab and the frame has to come from here.
 *
 * These are pointer affordances with no keyboard route, which is what they replace: a
 * native sizing border is not focusable either, and this window has no system menu to
 * offer Size from. The cursor change is the whole discoverability story, so the handles
 * stay invisible rather than growing a grip that would be the one decorative mark in the
 * interface.
 */

/** Handles are `fixed`, so on a frameless window the viewport is exactly the frame. */
const EDGE_CLASS: Record<ResizeEdge, string> = {
  n: 'top-0 right-0 left-0 h-1 cursor-ns-resize',
  s: 'right-0 bottom-0 left-0 h-1 cursor-ns-resize',
  w: 'top-0 bottom-0 left-0 w-1 cursor-ew-resize',
  e: 'top-0 right-0 bottom-0 w-1 cursor-ew-resize',
  nw: 'top-0 left-0 size-3 cursor-nwse-resize',
  ne: 'top-0 right-0 size-3 cursor-nesw-resize',
  sw: 'bottom-0 left-0 size-3 cursor-nesw-resize',
  se: 'right-0 bottom-0 size-3 cursor-nwse-resize',
}

const liveHost: WindowResizeHost = {
  getPlacement: () => bun().request.getWindowPlacement(),
  setFrame: (frame) => {
    bun().send.setWindowFrame(frame)
  },
  requestFrame: (run) => requestAnimationFrame(run),
  cancelFrame: (handle) => {
    cancelAnimationFrame(handle)
  },
}

/** Adapt a pointer event, and the capture it needs to hold, into what a drag reads. */
function pointerFrom(event: TargetedPointerEvent<HTMLDivElement>) {
  const handle = event.currentTarget
  const { pointerId } = event
  return {
    pointerId,
    button: event.button,
    screenX: event.screenX,
    screenY: event.screenY,
    capture: () => {
      handle.setPointerCapture(pointerId)
    },
    release: () => {
      handle.releasePointerCapture(pointerId)
    },
  }
}

export type WindowResizeHandlesProps = {
  /** Override platform detection for tests and future host adapters. */
  platform?: DesktopPlatform
  host?: WindowResizeHost
}

export function WindowResizeHandles({
  platform = chromePlatform(),
  host = liveHost,
}: WindowResizeHandlesProps) {
  const resize = useMemo(() => createWindowResize(host), [host])

  if (!supportsCustomWindowChrome(platform)) {
    return null
  }

  return (
    <div aria-hidden="true" class="pointer-events-none fixed inset-0 z-50">
      {RESIZE_EDGES.map((edge) => (
        <div
          key={edge}
          class={cn(
            'electrobun-webkit-app-region-no-drag pointer-events-auto absolute',
            EDGE_CLASS[edge],
          )}
          onLostPointerCapture={(event) => {
            resize.end(event)
          }}
          onPointerCancel={(event) => {
            resize.end(event)
          }}
          onPointerDown={(event) => {
            event.preventDefault()
            resize.start(edge, pointerFrom(event))
          }}
          onPointerMove={(event) => {
            resize.move(event)
          }}
          onPointerUp={(event) => {
            resize.end(event)
          }}
        />
      ))}
    </div>
  )
}
