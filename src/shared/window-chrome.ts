export type DesktopPlatform = 'windows' | 'macos' | 'linux' | 'unknown'

/** Platforms with a matching renderer in WindowChrome. */
export const CUSTOM_CHROME_PLATFORMS = ['windows'] as const satisfies readonly DesktopPlatform[]

export type CustomChromePlatform = (typeof CUSTOM_CHROME_PLATFORMS)[number]

/** Normalize host platform names and browser user agents to one application vocabulary. */
export function desktopPlatform(value: string): DesktopPlatform {
  const normalized = value.toLowerCase()

  if (normalized === 'win32' || normalized.includes('windows')) {
    return 'windows'
  }
  if (
    normalized === 'darwin' ||
    normalized.includes('macintosh') ||
    normalized.includes('mac os')
  ) {
    return 'macos'
  }
  if (normalized === 'linux' || normalized.includes('linux') || normalized.includes('x11')) {
    return 'linux'
  }

  return 'unknown'
}

export function supportsCustomWindowChrome(
  platform: DesktopPlatform,
): platform is CustomChromePlatform {
  return CUSTOM_CHROME_PLATFORMS.some((candidate) => candidate === platform)
}
