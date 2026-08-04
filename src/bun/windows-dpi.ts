/** Enable per-monitor DPI awareness before creating a window. */

import { dlopen, FFIType } from 'bun:ffi'

export type DisplayInfo = {
  scale: number
  width: number
  height: number
}

const UNKNOWN: DisplayInfo = { scale: 1, width: 0, height: 0 }

const PER_MONITOR_AWARE_V2 = -4n

const SM_CXSCREEN = 0
const SM_CYSCREEN = 1

export function enablePerMonitorDpi(): DisplayInfo {
  if (process.platform !== 'win32') return UNKNOWN

  try {
    const user32 = dlopen('user32.dll', {
      SetProcessDpiAwarenessContext: { args: [FFIType.i64], returns: FFIType.bool },
      GetDpiForSystem: { args: [], returns: FFIType.u32 },
      GetSystemMetrics: { args: [FFIType.i32], returns: FFIType.i32 },
    })

    // Read the current DPI even if awareness was set by a manifest.
    user32.symbols.SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)

    const dpi = user32.symbols.GetDpiForSystem()
    return {
      scale: dpi > 0 ? dpi / 96 : 1,
      width: user32.symbols.GetSystemMetrics(SM_CXSCREEN),
      height: user32.symbols.GetSystemMetrics(SM_CYSCREEN),
    }
  } catch {
    // Keep the app usable if the API or FFI is unavailable.
    return UNKNOWN
  }
}
