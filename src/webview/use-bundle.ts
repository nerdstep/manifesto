/**
 * One editing session: a Source Mark, the settings being edited, and the Bundle on disk.
 *
 * The panel is a live editor, so every change round-trips to the Bun shell and lands on
 * disk. Three things make that safe, and they are the reason this is a module rather than
 * a handful of `useState` calls in `App.tsx`:
 *
 * 1. **Host queue.** Every accepted edit is sent immediately. The Bun side serializes
 *    generation and keeps only the newest queued revision, so closing the webview cannot
 *    strand a value in a browser timer and a colour drag cannot build an unbounded queue.
 * 2. **Ordering.** Requests carry a monotonic revision and responses are matched against a
 *    ticket, so a slow re-render cannot overwrite a later, faster metadata edit.
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
import type { BundleWire, GenerateResult, GenerateTrigger } from '../shared/rpc.ts'
import { bun } from './rpc.ts'

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

/** Keep transport failures actionable without exposing an RPC/library error to the UI. */
function describeRpcFailure(error: unknown): string {
  if (error instanceof Error && /timed out/iu.test(error.message)) {
    return 'Manifesto took too long to finish. Check the output folder and try again.'
  }
  return 'Manifesto could not finish writing the Asset Bundle. Check the output folder and try again.'
}

export function useBundle() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [session, setSession] = useState<Session | null>(null)
  /** True from the moment a change is made until its Bundle comes back. */
  const [pending, setPending] = useState(false)

  const current = useRef<Session | null>(null)
  const sessionId = useRef(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
  const ticket = useRef(0)

  /** The only writer of the session. Keeps the render copy and the callback copy in step. */
  const commit = useCallback((next: Session | null) => {
    current.current = next
    setSession(next)
  }, [])

  const send = useCallback(
    async (next: Session, trigger: GenerateTrigger) => {
      ticket.current += 1
      const mine = ticket.current

      let result: GenerateResult
      try {
        result = await bun().request.generate({
          sessionId: sessionId.current,
          sourceSvg: next.sourceSvg,
          filename: next.filename,
          darkSvg: next.darkSvg,
          settings: next.settings,
          bundleName: next.bundleName,
          trigger,
          revision: mine,
        })
      } catch (error) {
        if (mine !== ticket.current) return
        setPending(false)
        setStatus({ kind: 'failed', error: describeRpcFailure(error) })
        return
      }

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

  /** Apply a change and send it immediately; the host coalesces expensive work. */
  const schedule = useCallback(
    (next: Session, trigger: GenerateTrigger) => {
      commit(next)
      setPending(true)
      void send(next, trigger)
    },
    [commit, send],
  )

  /** Apply a change and regenerate immediately — for discrete actions, not for typing. */
  const now = useCallback(
    (next: Session, trigger: GenerateTrigger) => {
      commit(next)
      setPending(true)
      void send(next, trigger)
    },
    [commit, send],
  )
  /**
   * Start a session from a Source Mark, however it arrived.
   *
   * Dropping and choosing differ only in where the text came from. One implementation
   * keeps the keyboard route from quietly diverging from the one everybody tests.
   */
  const begin = useCallback(
    async (sourceSvg: string, filename: string) => {
      setStatus({ kind: 'working', filename })

      ticket.current += 1
      const mine = ticket.current

      let result: GenerateResult
      try {
        result = await bun().request.generate({
          sessionId: sessionId.current,
          sourceSvg,
          filename,
          darkSvg: null,
          settings: null,
          bundleName: null,
          trigger: 'drop',
          revision: mine,
        })
      } catch (error) {
        if (mine !== ticket.current) return
        setPending(false)
        setStatus({ kind: 'failed', error: describeRpcFailure(error) })
        return
      }

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
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve()
        })
      })
      try {
        await bun().request.refreshViewport()
      } catch (error) {
        bun().send.log({ level: 'error', message: describeRpcFailure(error) })
      }
    },
    [commit],
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

  /** Change one or more settings. The host coalesces repeated edits. */
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

  /** Persist the current Bundle after the user chooses a new Output Root. */
  const regenerate = useCallback(
    (trigger: GenerateTrigger = 'edit') => {
      const latest = current.current
      if (latest === null) return
      now(latest, trigger)
    },
    [now],
  )

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
    regenerate,
  }
}
