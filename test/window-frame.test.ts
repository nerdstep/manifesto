import { describe, expect, test } from 'bun:test'

import { MIN_WINDOW_CSS, RESIZE_EDGES, resizeFrame } from '../src/shared/window-frame.ts'

const ORIGIN = { x: 100, y: 80, width: 1280, height: 880 }

describe('resizeFrame', () => {
  test('grows on the south and east edges without moving the origin', () => {
    expect(resizeFrame(ORIGIN, 'e', 120, 0)).toEqual({ ...ORIGIN, width: 1400 })
    expect(resizeFrame(ORIGIN, 's', 0, 60)).toEqual({ ...ORIGIN, height: 940 })
  })

  test('moves the origin on the north and west edges', () => {
    // Dragging the west edge 200 left grows the window and moves x by the same amount,
    // so the east edge stays where it was.
    const west = resizeFrame(ORIGIN, 'w', -200, 0)
    expect(west).toEqual({ x: -100, y: 80, width: 1480, height: 880 })
    expect(west.x + west.width).toBe(ORIGIN.x + ORIGIN.width)

    const north = resizeFrame(ORIGIN, 'n', 0, -50)
    expect(north).toEqual({ x: 100, y: 30, width: 1280, height: 930 })
    expect(north.y + north.height).toBe(ORIGIN.y + ORIGIN.height)
  })

  test('applies both axes on a corner', () => {
    expect(resizeFrame(ORIGIN, 'se', 100, 100)).toEqual({
      x: 100,
      y: 80,
      width: 1380,
      height: 980,
    })
    expect(resizeFrame(ORIGIN, 'nw', 40, 30)).toEqual({
      x: 140,
      y: 110,
      width: 1240,
      height: 850,
    })
  })

  test('ignores the axis an edge does not own', () => {
    expect(resizeFrame(ORIGIN, 'e', 100, 999)).toEqual({ ...ORIGIN, width: 1380 })
    expect(resizeFrame(ORIGIN, 'n', 999, -20)).toEqual({ ...ORIGIN, y: 60, height: 900 })
  })

  test('stops at the minimum size on every edge', () => {
    for (const edge of RESIZE_EDGES) {
      const clamped = resizeFrame(ORIGIN, edge, 5000, 5000)
      expect(clamped.width).toBeGreaterThanOrEqual(MIN_WINDOW_CSS.width)
      expect(clamped.height).toBeGreaterThanOrEqual(MIN_WINDOW_CSS.height)
    }
  })

  test('holds the anchored edge still while the dragged edge is clamped', () => {
    // Past the floor from the west: x stops advancing so the east edge cannot move.
    const clamped = resizeFrame(ORIGIN, 'nw', 5000, 5000)
    expect(clamped.width).toBe(MIN_WINDOW_CSS.width)
    expect(clamped.height).toBe(MIN_WINDOW_CSS.height)
    expect(clamped.x + clamped.width).toBe(ORIGIN.x + ORIGIN.width)
    expect(clamped.y + clamped.height).toBe(ORIGIN.y + ORIGIN.height)
  })

  test('clamping does not accumulate — dragging back returns the edge exactly', () => {
    const past = resizeFrame(ORIGIN, 'w', 5000, 0)
    expect(past.width).toBe(MIN_WINDOW_CSS.width)
    // The same drag measured from the starting frame, not from the clamped one.
    expect(resizeFrame(ORIGIN, 'w', 80, 0)).toEqual({ ...ORIGIN, x: 180, width: 1200 })
  })

  test('rounds fractional pointer deltas into whole points', () => {
    expect(resizeFrame(ORIGIN, 'se', 10.4, 10.6)).toEqual({
      x: 100,
      y: 80,
      width: 1290,
      height: 891,
    })
    const west = resizeFrame(ORIGIN, 'w', -10.5, 0)
    expect(Number.isInteger(west.x)).toBe(true)
    expect(Number.isInteger(west.width)).toBe(true)
  })

  test('lists corners after edges so they win the hit test', () => {
    const corners = RESIZE_EDGES.filter((edge) => edge.length === 2)
    const firstCorner = RESIZE_EDGES.findIndex((edge) => edge.length === 2)
    expect(corners).toHaveLength(4)
    expect(RESIZE_EDGES.slice(firstCorner)).toEqual(corners)
  })
})
