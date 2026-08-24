import { describe, expect, test } from 'bun:test'

import type { WindowFrame, WindowPlacement } from '../src/shared/window-frame.ts'
import { MIN_WINDOW_CSS } from '../src/shared/window-frame.ts'
import { createWindowResize } from '../src/webview/window-resize.ts'
import type { WindowResizeHost } from '../src/webview/window-resize.ts'

const PLACEMENT: WindowPlacement = { x: 100, y: 80, width: 1280, height: 880, maximized: false }

/** A host with a hand-cranked repaint clock, so a drag can be stepped frame by frame. */
function testHost(placement: WindowPlacement = PLACEMENT) {
  const frames: WindowFrame[] = []
  const clock: (() => void)[] = []
  let released = 0
  let handle = 0

  const host: WindowResizeHost = {
    getPlacement: () => Promise.resolve(placement),
    setFrame: (frame) => frames.push(frame),
    requestFrame: (run) => {
      clock.push(run)
      handle += 1
      return handle
    },
    cancelFrame: () => {
      clock.length = 0
    },
  }

  return {
    host,
    frames,
    /** Run whatever the controller scheduled, the way a repaint would. */
    tick: () => {
      const due = [...clock]
      clock.length = 0
      for (const run of due) {
        run()
      }
    },
    pendingFrames: () => clock.length,
    releases: () => released,
    pointer: (
      over: Partial<{ pointerId: number; button: number; screenX: number; screenY: number }> = {},
    ) => ({
      pointerId: 1,
      button: 0,
      screenX: 0,
      screenY: 0,
      capture: () => {},
      release: () => {
        released += 1
      },
      ...over,
    }),
  }
}

describe('window resize drag', () => {
  test('sends the frame the drag reaches on the next repaint', async () => {
    const t = testHost()
    const resize = createWindowResize(t.host)

    resize.start('e', t.pointer({ screenX: 1380, screenY: 500 }))
    await Promise.resolve()

    resize.move({ pointerId: 1, screenX: 1480, screenY: 500 })
    expect(t.frames).toEqual([])

    t.tick()
    expect(t.frames).toEqual([{ x: 100, y: 80, width: 1380, height: 880 }])
  })

  test('coalesces a burst of moves into one frame', async () => {
    const t = testHost()
    const resize = createWindowResize(t.host)

    resize.start('e', t.pointer({ screenX: 1380 }))
    await Promise.resolve()

    for (const screenX of [1400, 1420, 1440, 1460]) {
      resize.move({ pointerId: 1, screenX, screenY: 0 })
    }
    expect(t.pendingFrames()).toBe(1)

    t.tick()
    expect(t.frames).toEqual([{ x: 100, y: 80, width: 1360, height: 880 }])
  })

  test('drops moves that arrive before the placement lands', () => {
    const t = testHost()
    const resize = createWindowResize(t.host)

    // No `await`, so the round trip has not resolved yet.
    resize.start('e', t.pointer({ screenX: 1380 }))
    resize.move({ pointerId: 1, screenX: 1480, screenY: 0 })
    t.tick()

    expect(t.frames).toEqual([])
  })

  test('lands the last position on release even if no repaint ran', async () => {
    const t = testHost()
    const resize = createWindowResize(t.host)

    resize.start('se', t.pointer({ screenX: 1380, screenY: 960 }))
    await Promise.resolve()

    resize.move({ pointerId: 1, screenX: 1480, screenY: 1010 })
    resize.end({ pointerId: 1 })

    expect(t.frames).toEqual([{ x: 100, y: 80, width: 1380, height: 930 }])
  })

  test('ignores moves after the drag ends', async () => {
    const t = testHost()
    const resize = createWindowResize(t.host)

    resize.start('e', t.pointer({ screenX: 1380 }))
    await Promise.resolve()
    resize.end({ pointerId: 1 })
    t.frames.length = 0

    resize.move({ pointerId: 1, screenX: 1900, screenY: 0 })
    t.tick()
    expect(t.frames).toEqual([])
  })

  test('ignores a second pointer mid-drag', async () => {
    const t = testHost()
    const resize = createWindowResize(t.host)

    resize.start('e', t.pointer({ screenX: 1380 }))
    await Promise.resolve()

    resize.move({ pointerId: 2, screenX: 1900, screenY: 0 })
    t.tick()
    expect(t.frames).toEqual([])

    // The end of the other pointer must not tear down this drag either.
    resize.end({ pointerId: 2 })
    resize.move({ pointerId: 1, screenX: 1400, screenY: 0 })
    t.tick()
    expect(t.frames).toEqual([{ x: 100, y: 80, width: 1300, height: 880 }])
  })

  test('does not start on a non-primary button', () => {
    const t = testHost()
    const resize = createWindowResize(t.host)

    resize.start('e', t.pointer({ button: 2, screenX: 1380 }))
    resize.move({ pointerId: 1, screenX: 1900, screenY: 0 })
    t.tick()

    expect(t.frames).toEqual([])
  })

  test('refuses to resize a maximized window and gives the capture back', async () => {
    const t = testHost({ ...PLACEMENT, maximized: true })
    const resize = createWindowResize(t.host)

    resize.start('e', t.pointer({ screenX: 1380 }))
    await Promise.resolve()

    expect(t.releases()).toBe(1)
    resize.move({ pointerId: 1, screenX: 1900, screenY: 0 })
    t.tick()
    expect(t.frames).toEqual([])
  })

  test('never hands the window a size it already has', async () => {
    const t = testHost()
    const resize = createWindowResize(t.host)

    resize.start('e', t.pointer({ screenX: 1380 }))
    await Promise.resolve()

    // Windows delivers more moves than distinct positions.
    for (const screenX of [1400, 1400, 1400]) {
      resize.move({ pointerId: 1, screenX, screenY: 0 })
      t.tick()
    }
    expect(t.frames).toEqual([{ x: 100, y: 80, width: 1300, height: 880 }])

    resize.move({ pointerId: 1, screenX: 1420, screenY: 0 })
    t.tick()
    expect(t.frames).toHaveLength(2)
  })

  test('clamps at the floor without moving the anchored edge', async () => {
    const t = testHost()
    const resize = createWindowResize(t.host)

    resize.start('w', t.pointer({ screenX: 100 }))
    await Promise.resolve()

    resize.move({ pointerId: 1, screenX: 5000, screenY: 0 })
    t.tick()

    const frame = t.frames.at(-1)
    expect(frame?.width).toBe(MIN_WINDOW_CSS.width)
    expect((frame?.x ?? 0) + (frame?.width ?? 0)).toBe(PLACEMENT.x + PLACEMENT.width)
  })
})
