import { resizeFrame } from '../shared/window-frame.ts'
import type { ResizeEdge, WindowFrame, WindowPlacement } from '../shared/window-frame.ts'

/** Everything a resize drag needs from outside itself: the window, and a repaint clock. */
export type WindowResizeHost = {
  getPlacement: () => Promise<WindowPlacement>
  setFrame: (frame: WindowFrame) => void
  requestFrame: (run: () => void) => number
  cancelFrame: (handle: number) => void
}

/** The part of a `PointerEvent` a drag reads, plus the capture it has to hold. */
export type ResizePointer = {
  pointerId: number
  button: number
  screenX: number
  screenY: number
  capture: () => void
  release: () => void
}

export type WindowResize = {
  start: (edge: ResizeEdge, pointer: ResizePointer) => void
  move: (pointer: Pick<ResizePointer, 'pointerId' | 'screenX' | 'screenY'>) => void
  end: (pointer: Pick<ResizePointer, 'pointerId'>) => void
}

function sameFrame(a: WindowFrame, b: WindowFrame): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

type Drag = {
  pointerId: number
  edge: ResizeEdge
  screenX: number
  screenY: number
  release: () => void
  /** Null until the placement round trip lands. Moves before that are dropped. */
  origin: WindowFrame | null
}

/**
 * Turn a pointer drag on a window edge into frames for the main process.
 *
 * Kept out of the component so it can be driven directly: a resize is a sequence of
 * pointer events against a round trip that may land late, which is worth testing without
 * a DOM in the way.
 */
export function createWindowResize(host: WindowResizeHost): WindowResize {
  let drag: Drag | null = null
  let pending: WindowFrame | null = null
  let sent: WindowFrame | null = null
  let frameRequest = 0

  // One frame per repaint. Pointer moves arrive faster than the window can resize, and
  // every extra frame is a synchronous native call on the main process.
  function flush(): void {
    frameRequest = 0
    if (pending === null) {
      return
    }

    const frame = pending
    pending = null

    // Windows delivers more pointer moves than distinct positions, and every frame is a
    // synchronous native call. Handing the window the size it already has is pure cost.
    if (sent !== null && sameFrame(sent, frame)) {
      return
    }
    sent = frame
    host.setFrame(frame)
  }

  return {
    start(edge, pointer) {
      if (pointer.button !== 0) {
        return
      }

      const started: Drag = {
        pointerId: pointer.pointerId,
        edge,
        screenX: pointer.screenX,
        screenY: pointer.screenY,
        release: pointer.release,
        origin: null,
      }
      drag = started
      sent = null
      pointer.capture()

      void (async () => {
        const placement = await host.getPlacement()
        if (drag !== started) {
          return
        }
        // Windows disables its own sizing borders while maximized. Matching that beats
        // resizing a frame the user cannot see.
        if (placement.maximized) {
          drag = null
          started.release()
          return
        }
        started.origin = {
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
        }
      })()
    },

    move(pointer) {
      if (drag === null || drag.pointerId !== pointer.pointerId || drag.origin === null) {
        return
      }

      // Screen coordinates, measured against the frame the drag started from. A north or
      // west drag moves the window's origin out from under the pointer, and a delta taken
      // from the previous frame would chase it.
      pending = resizeFrame(
        drag.origin,
        drag.edge,
        pointer.screenX - drag.screenX,
        pointer.screenY - drag.screenY,
      )
      if (frameRequest === 0) {
        frameRequest = host.requestFrame(flush)
      }
    },

    end(pointer) {
      if (drag === null || drag.pointerId !== pointer.pointerId) {
        return
      }
      drag = null

      // Land the frame the pointer last asked for, not the last one that repainted.
      if (frameRequest !== 0) {
        host.cancelFrame(frameRequest)
      }
      flush()
    },
  }
}
