/** Window geometry in points, which is the unit `BrowserWindow` reports and accepts. */
export type WindowFrame = { x: number; y: number; width: number; height: number }

/** A frame plus the one state that suppresses resizing. */
export type WindowPlacement = WindowFrame & { maximized: boolean }

export type ResizeEdge = 'n' | 's' | 'w' | 'e' | 'nw' | 'ne' | 'sw' | 'se'

/**
 * Every draggable edge, corners last.
 *
 * The handles are absolutely positioned siblings at one z-index, so the later ones win
 * the hit test. A corner listed before its two edges would be unreachable.
 */
export const RESIZE_EDGES = [
  'n',
  's',
  'w',
  'e',
  'nw',
  'ne',
  'sw',
  'se',
] as const satisfies readonly ResizeEdge[]

/**
 * The floor a drag may shrink the window to.
 *
 * The layout itself survives much narrower — the source pane's column bottoms out at
 * 300px, which with the page's 28px padding and the 12px scrollbar gutter still fits
 * inside 368px. This is the smaller of the two useful limits: half the default width, so
 * the window can sit beside another on a 1280 point display without the Pipeline Strip
 * collapsing to icons.
 */
export const MIN_WINDOW_CSS = { width: 640, height: 480 }

/**
 * Apply a drag on one edge to the frame the drag started from.
 *
 * The delta is measured against the *starting* frame rather than the previous one, so
 * clamping at the minimum size cannot accumulate error: drag past the floor and back, and
 * the edge returns to exactly where the pointer left it.
 *
 * A north or west drag moves the window's origin, which is why the delta is clamped there
 * instead of the size — the dragged edge stops at the floor and the opposite edge stays
 * where it is.
 */
export function resizeFrame(
  origin: WindowFrame,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  min: { width: number; height: number } = MIN_WINDOW_CSS,
): WindowFrame {
  // Round once, here, so no caller can hand the window a fractional frame.
  const movedX = Math.round(dx)
  const movedY = Math.round(dy)

  const west = edge.includes('w')
  const east = edge.includes('e')
  const north = edge.includes('n')
  const south = edge.includes('s')

  const left = west ? Math.min(movedX, origin.width - min.width) : 0
  const top = north ? Math.min(movedY, origin.height - min.height) : 0

  return {
    x: origin.x + left,
    y: origin.y + top,
    width: east ? Math.max(min.width, origin.width + movedX) : origin.width - left,
    height: south ? Math.max(min.height, origin.height + movedY) : origin.height - top,
  }
}
