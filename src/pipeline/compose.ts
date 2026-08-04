import { isDarkColor } from '../shared/color.ts'
import type { NormalizedMark } from './normalize.ts'
import { CANONICAL_SIZE } from './renditions.ts'
import type { Hex, Treatment } from './types.ts'

function n(value: number): string {
  return Number(value.toFixed(4)).toString()
}

export { luminanceOf, relativeLuminance } from '../shared/color.ts'

export function isDark(hex: Hex): boolean {
  return isDarkColor(hex)
}

export function markFor(
  source: NormalizedMark,
  dark: NormalizedMark | null,
  background: Hex | null,
): NormalizedMark {
  if (dark === null || background === null) return source
  return isDark(background) ? dark : source
}

export function scaleFor(mark: NormalizedMark, fit: Treatment['fit']): number {
  if (fit.mode === 'circle') {
    return (CANONICAL_SIZE * fit.diameter) / 2 / mark.maxRadius
  }
  return (CANONICAL_SIZE * (1 - 2 * fit.inset)) / Math.max(mark.extent.w, mark.extent.h)
}

export function composeInner(mark: NormalizedMark, treatment: Treatment): string {
  const { extent } = mark
  const scale = scaleFor(mark, treatment.fit)

  const tx = CANONICAL_SIZE / 2 - (extent.x + extent.w / 2) * scale
  const ty = CANONICAL_SIZE / 2 - (extent.y + extent.h / 2) * scale

  return `<g transform="translate(${n(tx)} ${n(ty)}) scale(${n(scale)})">${mark.nestable}</g>`
}

export function canvas(body: string, background: Hex | null): string {
  const backdrop =
    background === null
      ? ''
      : `<rect width="${CANONICAL_SIZE}" height="${CANONICAL_SIZE}" fill="${background}"/>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANONICAL_SIZE} ${CANONICAL_SIZE}">` +
    backdrop +
    body +
    `</svg>`
  )
}

export function compose(
  mark: NormalizedMark,
  treatment: Treatment,
  background: Hex | null,
): string {
  return canvas(composeInner(mark, treatment), background)
}
