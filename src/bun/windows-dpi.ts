/**
 * Tell Windows this process knows what a pixel is.
 *
 * Without this the app is DPI-**unaware**, and on any display scaled above 100% Windows
 * renders the whole window at 96 DPI and then bitmap-stretches it. Everything is soft:
 * text visibly blurrier than every other window on the desktop. Measured on a 2560×1440
 * display at 150%, `GetDpiForSystem()` returns 96 before this call and 144 after.
 *
 * It has to be done here because nothing upstream does it: `launcher.exe` ships with no
 * embedded manifest at all, and `libNativeWrapper.dll` never calls
 * `SetProcessDpiAwareness`. Declaring awareness in a manifest would be the conventional
 * route, but we do not own either binary — this is our own entrypoint, and the setting is
 * process-wide.
 *
 * **Call before any window exists.** DPI awareness is latched the first time the process
 * touches a window or a device context; after that the call fails and is ignored.
 *
 * The consequence to keep in mind: once aware, window frames are in *physical* pixels
 * rather than virtualized ones, so a frame that used to be stretched to 1.5× now is not.
 * `windowFrame()` in `app-state.ts` scales the intended size back up, which is why the
 * scale factor is returned rather than discarded.
 */

import { dlopen, FFIType } from 'bun:ffi'

/** What the display turned out to be, in physical pixels. */
export type DisplayInfo = {
  /** Physical pixels per CSS pixel. 1 when unknown. */
  scale: number
  /** Primary display size in physical pixels, or 0 when unknown. */
  width: number
  height: number
}

const UNKNOWN: DisplayInfo = { scale: 1, width: 0, height: 0 }

/** `DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2`, which is the handle value `-4`. */
const PER_MONITOR_AWARE_V2 = -4n

/** `GetSystemMetrics` indices for the primary display. */
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

    // Returns false if awareness was already set — by a manifest, or by an earlier call.
    // Not an error: the goal is the state, not the transition, so read it back either way.
    user32.symbols.SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)

    const dpi = user32.symbols.GetDpiForSystem()
    return {
      scale: dpi > 0 ? dpi / 96 : 1,
      width: user32.symbols.GetSystemMetrics(SM_CXSCREEN),
      height: user32.symbols.GetSystemMetrics(SM_CYSCREEN),
    }
  } catch {
    // An old Windows without `SetProcessDpiAwarenessContext`, or FFI unavailable. A blurry
    // window is a bad outcome; failing to start is a worse one.
    return UNKNOWN
  }
}
