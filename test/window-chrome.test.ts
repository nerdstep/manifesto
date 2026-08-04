import { describe, expect, test } from 'bun:test'

import { desktopPlatform, supportsCustomWindowChrome } from '../src/shared/window-chrome.ts'

describe('desktopPlatform', () => {
  test('normalizes Bun host platform names', () => {
    expect(desktopPlatform('win32')).toBe('windows')
    expect(desktopPlatform('darwin')).toBe('macos')
    expect(desktopPlatform('linux')).toBe('linux')
  })

  test('normalizes browser user agents', () => {
    expect(desktopPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
    expect(desktopPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos')
    expect(desktopPlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux')
  })

  test('keeps unsupported platforms on native chrome', () => {
    expect(desktopPlatform('freebsd')).toBe('unknown')
    expect(supportsCustomWindowChrome('unknown')).toBe(false)
  })
})

describe('custom window chrome support', () => {
  test('uses the custom renderer only on Windows', () => {
    expect(supportsCustomWindowChrome('windows')).toBe(true)
    expect(supportsCustomWindowChrome('macos')).toBe(false)
    expect(supportsCustomWindowChrome('linux')).toBe(false)
  })
})
