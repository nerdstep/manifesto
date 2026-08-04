import { isEqual } from 'es-toolkit'
import { useCallback, useRef, useState } from 'preact/hooks'

import type { Settings } from '../pipeline/index.ts'
import type { BundleWire, GenerateResult, GenerateTrigger } from '../shared/rpc.ts'
import { bun } from './rpc.ts'

export type Session = {
  filename: string
  sourceSvg: string
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

function describeRpcFailure(error: unknown): string {
  if (error instanceof Error && /timed out/iu.test(error.message)) {
    return 'Manifesto took too long to finish. Check the output folder and try again.'
  }
  return 'Manifesto could not finish writing the icon files. Check the output folder and try again.'
}

export function useBundle() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [session, setSession] = useState<Session | null>(null)
  const [pending, setPending] = useState(false)

  const current = useRef<Session | null>(null)
  const sessionId = useRef(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
  const ticket = useRef(0)

  // Keep React state and callback-visible state synchronized.
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

      // Ignore responses for older revisions.
      if (mine !== ticket.current) return

      setPending(false)

      if (!result.ok) {
        setStatus({ kind: 'failed', error: result.error })
        return
      }

      setStatus({ kind: 'done', bundle: result.bundle })

      // Follow a folder name selected by the collision dialog.
      if (result.bundle.bundleName !== current.current?.bundleName) {
        const latest = current.current
        if (latest !== null) commit({ ...latest, bundleName: result.bundle.bundleName })
      }
    },
    [commit],
  )

  const schedule = useCallback(
    (next: Session, trigger: GenerateTrigger) => {
      commit(next)
      setPending(true)
      void send(next, trigger)
    },
    [commit, send],
  )

  const now = useCallback(
    (next: Session, trigger: GenerateTrigger) => {
      commit(next)
      setPending(true)
      void send(next, trigger)
    },
    [commit, send],
  )
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

  const drop = useCallback(
    async (file: File) => {
      await begin(await file.text(), file.name)
    },
    [begin],
  )

  const open = useCallback(async () => {
    const picked = await bun().request.chooseSvg()
    if (picked === null) return
    await begin(picked.svg, picked.filename)
  }, [begin])

  const patch = useCallback(
    (change: Partial<Settings>) => {
      const latest = current.current
      if (latest === null) return

      // Color inputs can fire twice for one value. Skip identical settings.
      const settings = { ...latest.settings, ...change }
      if (isEqual(settings, latest.settings)) return

      schedule({ ...latest, settings }, 'edit')
    },
    [schedule],
  )

  const rename = useCallback(
    (bundleName: string) => {
      const latest = current.current
      if (latest === null || bundleName === latest.bundleName || bundleName.length === 0) return
      now({ ...latest, bundleName }, 'rename')
    },
    [now],
  )

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
