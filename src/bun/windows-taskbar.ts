/**
 * Give the window the taskbar identity of its installed launcher (electrobun#514).
 *
 * Electrobun sets no AppUserModelID, so Windows groups the running window under the
 * main-process executable: a second taskbar button beside the pinned launcher. These
 * window properties name the ID, and the command Windows runs when the window is
 * pinned.
 *
 *   pinned launcher.exe ─┐
 *                        ├─ same AppUserModelID ─▶ one taskbar button
 *   running window ──────┘
 *
 * Adapted from https://gist.github.com/petersvp/eb4041bfba3141bcc2d127d231db7a53
 */

import { dlopen, FFIType, linkSymbols, ptr, read, type Pointer } from 'bun:ffi'
import { dirname, join } from 'node:path'

export type TaskbarIdentity = {
  applicationId: string
  displayName: string
}

// Electrobun's Windows bundle: `bin/` holds the main process and the launcher,
// `Resources/` the icon.
const LAUNCHER_FILE = 'launcher.exe'
const ICON_PATH = join('..', 'Resources', 'app.ico')

// IID_IPropertyStore and the System.AppUserModel property set, as the 32-bit words
// Windows expects in memory.
const IID_PROPERTY_STORE = new Uint32Array([0x886d8eeb, 0x44468cf2, 0xbacd028d, 0x99cfbd1d])
const APP_USER_MODEL_FMTID = [0x9f4c2855, 0x4b399f79, 0xd4e1d0a8, 0xf3d5e12d]

// System.AppUserModel property IDs.
const PID_RELAUNCH_COMMAND = 2
const PID_RELAUNCH_ICON = 3
const PID_RELAUNCH_DISPLAY_NAME = 4
const PID_ID = 5

const COINIT_MULTITHREADED = 0
const RPC_E_CHANGED_MODE = -2147417850
const VT_LPWSTR = 31
const PROPVARIANT_BYTES = 24
const POINTER_BYTES = 8

// Vtable slots.
const IUNKNOWN_RELEASE = 2
const IPROPERTYSTORE_SET_VALUE = 6

type PropertyValue = [propertyId: number, value: string | null]

/**
 * Set the window's taskbar identity. Returns the cleanup Windows requires before the
 * window closes; calling it more than once is safe.
 */
export function setTaskbarIdentity(window: Pointer | null, identity: TaskbarIdentity): () => void {
  if (window === null) {
    throw new Error('Electrobun did not provide a native window handle.')
  }

  const bin = dirname(process.execPath)

  // Windows reads the relaunch details when the ID is set, so the ID goes last.
  setWindowProperties(window, [
    [PID_RELAUNCH_COMMAND, `"${join(bin, LAUNCHER_FILE)}"`],
    [PID_RELAUNCH_DISPLAY_NAME, identity.displayName],
    [PID_RELAUNCH_ICON, `${join(bin, ICON_PATH)},0`],
    [PID_ID, identity.applicationId],
  ])

  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    setWindowProperties(window, [
      [PID_ID, null],
      [PID_RELAUNCH_ICON, null],
      [PID_RELAUNCH_DISPLAY_NAME, null],
      [PID_RELAUNCH_COMMAND, null],
    ])
  }
}

function setWindowProperties(window: Pointer, values: PropertyValue[]): void {
  // The main process may not run on the native UI thread, so initialize COM here.
  const ole32 = dlopen('ole32.dll', {
    CoInitializeEx: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
    CoUninitialize: { args: [], returns: FFIType.void },
  })
  const initialized = ole32.symbols.CoInitializeEx(null, COINIT_MULTITHREADED)
  if (initialized < 0 && initialized !== RPC_E_CHANGED_MODE) {
    ole32.close()
    throw new Error(`Could not initialize COM: ${initialized}`)
  }

  try {
    writeWindowProperties(window, values)
  } finally {
    if (initialized >= 0) {
      ole32.symbols.CoUninitialize()
    }
    ole32.close()
  }
}

function writeWindowProperties(window: Pointer, values: PropertyValue[]): void {
  const shell32 = dlopen('shell32.dll', {
    SHGetPropertyStoreForWindow: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
  })

  try {
    const storeOut = new BigUint64Array(1)
    const opened = shell32.symbols.SHGetPropertyStoreForWindow(
      window,
      ptr(IID_PROPERTY_STORE),
      ptr(storeOut),
    )
    const store = Number(storeOut[0])
    if (opened < 0 || !isPointer(store)) {
      throw new Error(`Could not open the window's property store: ${opened}`)
    }

    const vtable = read.ptr(store)
    if (!isPointer(vtable)) {
      throw new Error('The window property store has no vtable.')
    }
    // Bind IPropertyStore's methods straight from its vtable.
    const methods = linkSymbols({
      SetValue: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
        returns: FFIType.i32,
        ptr: vtableSlot(vtable, IPROPERTYSTORE_SET_VALUE),
      },
      Release: {
        args: [FFIType.ptr],
        returns: FFIType.u32,
        ptr: vtableSlot(vtable, IUNKNOWN_RELEASE),
      },
    })

    try {
      for (const [propertyId, value] of values) {
        const key = new Uint32Array([...APP_USER_MODEL_FMTID, propertyId])
        // A zeroed PROPVARIANT is VT_EMPTY, which removes the property.
        const variant = new DataView(new ArrayBuffer(PROPVARIANT_BYTES))
        const text = value === null ? null : wideString(value)
        if (text !== null) {
          variant.setUint16(0, VT_LPWSTR, true)
          variant.setBigUint64(POINTER_BYTES, BigInt(ptr(text)), true)
        }

        const status = methods.symbols.SetValue(store, ptr(key), ptr(variant))
        if (status < 0) {
          throw new Error(`Could not set window property ${propertyId}: ${status}`)
        }
      }
    } finally {
      methods.symbols.Release(store)
      methods.close()
    }
  } finally {
    shell32.close()
  }
}

/** The method address in `slot` of a COM interface's vtable. */
function vtableSlot(vtable: Pointer, slot: number): Pointer {
  const method = read.ptr(vtable, slot * POINTER_BYTES)
  if (!isPointer(method)) {
    throw new Error(`COM vtable slot ${slot} is empty.`)
  }
  return method
}

/** `read.ptr` returns a plain number; a non-zero one is a usable address. */
function isPointer(address: number): address is Pointer {
  return address !== 0
}

/** NUL-terminated UTF-16, as Windows' `LPWSTR` expects. */
function wideString(value: string): Buffer {
  return Buffer.from(`${value}\0`, 'utf16le')
}
