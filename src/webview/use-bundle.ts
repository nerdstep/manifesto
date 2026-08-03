/**
 * One editing session: a Source Mark, the settings being edited, and the Bundle on disk.
 *
 * The panel is a live editor, so every change round-trips to the Bun shell and lands on
 * disk. Three things make that safe, and they are the reason this is a module rather than
 * a handful of `useState` calls in `App.tsx`:
 *
 * 1. **Debounce.** Colour pickers fire continuously while dragged. Requests go out at
 *    most every 150 ms, which is comfortably more than the ~60 ms a re-render costs and
 *    far more than the 0.007 ms a metadata-only change costs.
 * 2. **Ordering.** Responses are matched against a ticket, so a slow re-render cannot
 *    overwrite the result of a later, faster metadata edit. Without it, dragging a picker
 *    could settle on a stale Bundle.
 * 3. **A mirror of the session in a ref.** Callbacks must read the *current* session, not
 *    the one captured when they were created. `commit()` is the only writer and updates
 *    both at once, so the two cannot drift.
 *
 * `settings` and `bundleName` are `null` on the wire for a drop: inference reads pixels,
 * so it can only run on the Bun side, and the response is where the panel learns what it
 * is editing.
 */

import { isEqual } from 'es-toolkit'
import { useCallback, useRef, useState } from 'preact/hooks'

import type { Settings } from '../pipeline/index.ts'
import type { BundleWire, GenerateTrigger } from '../shared/rpc.ts'
import { bun } from './rpc.ts'

/**
 * How long to wait after a change before regenerating.
 *
 * Long enough that a dragged colour picker does not queue work faster than it completes,
 * short enough that it reads as live rather than as a save.
 */
const DEBOUNCE_MS = 150

/** Everything being edited right now. */
export type Session = {
  filename: string
  sourceSvg: string
  /** The optional second mark, used wherever the Icon Background is dark. */
  darkSvg: string | null
  darkFilename: string | null
  settings: Settings
  bundleName: string
}

export type Status =
  | { kind: 'idle' }
  | { kind: 'working'; filename: string }
  | { kind: 'failed'; error: string }
  | { kind: 'done'; bundle: BundleWire }

export function useBundle() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [session, setSession] = useState<Session | null>(null)
  /** True from the moment a change is made until its Bundle comes back. */
  const [pending, setPending] = useState(false)

  const current = useRef<Session | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ticket = useRef(0)
  /**
   * A rename queued behind a debounce must not be downgraded to an edit by a keystroke
   * that lands before the timer fires — that would skip the collision guard.
   */
  const queuedTrigger = useRef<GenerateTrigger>('edit')

  /** The only writer of the session. Keeps the render copy and the callback copy in step. */
  const commit = useCallback((next: Session | null) => {
    current.current = next
    setSession(next)
  }, [])

  const cancelPending = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const send = useCallback(
    async (next: Session, trigger: GenerateTrigger) => {
      ticket.current += 1
      const mine = ticket.current

      const result = await bun().request.generate({
        sourceSvg: next.sourceSvg,
        filename: next.filename,
        darkSvg: next.darkSvg,
        settings: next.settings,
        bundleName: next.bundleName,
        trigger,
      })

      // Superseded while in flight. Dropping the answer is right: a newer one is coming
      // and it was computed from newer inputs.
      if (mine !== ticket.current) return

      setPending(false)

      if (!result.ok) {
        setStatus({ kind: 'failed', error: result.error })
        return
      }

      setStatus({ kind: 'done', bundle: result.bundle })

      // A collision may have redirected the write. Follow it, so the next edit updates
      // the folder the user is actually looking at rather than re-prompting forever.
      if (result.bundle.bundleName !== current.current?.bundleName) {
        const latest = current.current
        if (latest !== null) commit({ ...latest, bundleName: result.bundle.bundleName })
      }
    },
    [commit],
  )

  /** Apply a change now and regenerate after the debounce. */
  const schedule = useCallback(
    (next: Session, trigger: GenerateTrigger) => {
      commit(next)
      setPending(true)
      if (trigger !== 'edit') queuedTrigger.current = trigger

      cancelPending()
      timer.current = setTimeout(() => {
        const use = queuedTrigger.current
        queuedTrigger.current = 'edit'
        void send(next, use)
      }, DEBOUNCE_MS)
    },
    [commit, cancelPending, send],
  )

  /** Apply a change and regenerate immediately — for discrete actions, not for typing. */
  const now = useCallback(
    (next: Session, trigger: GenerateTrigger) => {
      commit(next)
      setPending(true)
      cancelPending()
      queuedTrigger.current = 'edit'
      void send(next, trigger)
    },
    [commit, cancelPending, send],
  )

  /**
   * Start a session from a Source Mark, however it arrived.
   *
   * Dropping a file and choosing one from the native dialog differ only in where the text
   * came from. Keeping one implementation is what stops the keyboard route becoming a
   * second-class path that quietly diverges from the one everybody tests.
   */
  const begin = useCallback(
    async (sourceSvg: string, filename: string) => {
      cancelPending()
      setStatus({ kind: 'working', filename })

      ticket.current += 1
      const mine = ticket.current

      const result = await bun().request.generate({
        sourceSvg,
        filename,
        darkSvg: null,
        settings: null,
        bundleName: null,
        trigger: 'drop',
      })

      if (mine !== ticket.current) return
      setPending(false)

      if (!result.ok) {
        // No panel for a mark that produced nothing — there is nothing to edit.
        commit(null)
        setStatus({ kind: 'failed', error: result.error })
        return
      }

      commit({
        filename,
        sourceSvg,
        darkSvg: null,
        darkFilename: null,
        settings: result.bundle.settings,
        bundleName: result.bundle.bundleName,
      })
      setStatus({ kind: 'done', bundle: result.bundle })
    },
    [cancelPending, commit],
  )

  /**
   * A dropped file. The webview has no filesystem access, but SVG is text, so reading it
   * here and sending a string is all that is needed.
   */
  const drop = useCallback(
    async (file: File) => {
      await begin(await file.text(), file.name)
    },
    [begin],
  )

  /**
   * The native file picker — the keyboard route in.
   *
   * The Bun side reads the file, because it is the only side that can. A cancel comes back
   * as `null` and leaves everything exactly as it was.
   */
  const open = useCallback(async () => {
    const picked = await bun().request.chooseSvg()
    if (picked === null) return
    await begin(picked.svg, picked.filename)
  }, [begin])

  /** Change one or more settings. Debounced, because this is what typing calls. */
  const patch = useCallback(
    (change: Partial<Settings>) => {
      const latest = current.current
      if (latest === null) return

      // A change that changes nothing must not regenerate. Colour inputs fire on both
      // commit paths — the native picker closing and the field blurring — and re-writing
      // an identical Bundle would flicker the status line for no reason.
      //
      // `isEqual` rather than a hand-kept list of keys: the list version could only
      // promise that a forgotten field costs a redundant render, which is a caveat this
      // does not need to carry. `Settings` is flat and primitive-valued, so a deep compare
      // here is exact and cheap.
      const settings = { ...latest.settings, ...change }
      if (isEqual(settings, latest.settings)) return

      schedule({ ...latest, settings }, 'edit')
    },
    [schedule],
  )

  /**
   * Rename the Bundle folder. Immediate, and flagged so the collision guard runs.
   *
   * Never called from a Name edit: the folder is the user's, and having it follow the
   * manifest name would move their output from under them.
   */
  const rename = useCallback(
    (bundleName: string) => {
      const latest = current.current
      if (latest === null || bundleName === latest.bundleName || bundleName.length === 0) return
      now({ ...latest, bundleName }, 'rename')
    },
    [now],
  )

  /** Both routes to a Dark Mark land here, for the same reason `begin` exists. */
  const setDarkMark = useCallback(
    (darkSvg: string, darkFilename: string) => {
      const latest = current.current
      if (latest === null) return
      now({ ...latest, darkSvg, darkFilename }, 'edit')
    },
    [now],
  )

  const attachDarkMark = useCallback(
    async (file: File) => {
      setDarkMark(await file.text(), file.name)
    },
    [setDarkMark],
  )

  /** The native picker, so the Dark Mark is reachable without a pointer too. */
  const chooseDarkMark = useCallback(async () => {
    const picked = await bun().request.chooseSvg()
    if (picked === null) return
    setDarkMark(picked.svg, picked.filename)
  }, [setDarkMark])

  const clearDarkMark = useCallback(() => {
    const latest = current.current
    if (latest === null || latest.darkSvg === null) return
    now({ ...latest, darkSvg: null, darkFilename: null }, 'edit')
  }, [now])

  return {
    status,
    session,
    pending,
    drop,
    open,
    patch,
    rename,
    attachDarkMark,
    chooseDarkMark,
    clearDarkMark,
  }
}
