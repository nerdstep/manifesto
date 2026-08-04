/** Shared color math. Keep this module free of imports so the webview can use it. */

function linearise(value: number): number {
  const srgb = value / 255
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

export function luminanceOf(red: number, green: number, blue: number): number {
  return 0.2126 * linearise(red) + 0.7152 * linearise(green) + 0.0722 * linearise(blue)
}

export function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '')
  // Expand shorthand hex before parsing channels.
  const full =
    value.length === 3 ? value.replaceAll(/(.)/gu, '$1$1') : value.padEnd(6, '0').slice(0, 6)

  const channel = (offset: number): number => Number.parseInt(full.slice(offset, offset + 2), 16)

  return luminanceOf(channel(0), channel(2), channel(4))
}

export function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}

/** Shared threshold for mark selection and preview text color. */
export function isDarkColor(hex: string): boolean {
  return relativeLuminance(hex) < 0.5
}
