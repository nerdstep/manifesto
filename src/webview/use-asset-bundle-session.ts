import { isEqual, isNil } from 'es-toolkit'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import type { Settings } from '../pipeline/index.ts'
import type {
  AcceptIntentResult,
  AssetBundleIntent,
  AssetBundleSessionSnapshot,
} from '../shared/rpc.ts'
import type { createAssetBundleSessionClient } from './asset-bundle-session-client.ts'

const EMPTY_SNAPSHOT: AssetBundleSessionSnapshot = {
  desired: null,
  attempt: { kind: 'idle' },
  committed: null,
  matchesDesired: false,
  recoveryNotice: null,
}

function describeRpcFailure(error: unknown): string {
  if (error instanceof Error && /timed out/iu.test(error.message)) {
    return 'Manifesto took too long to contact the host. Try again.'
  }
  return 'Manifesto lost contact with the host. Try again.'
}

type AssetBundleSessionHookDeps = {
  client: ReturnType<typeof createAssetBundleSessionClient>
  chooseSvg: () => Promise<{ svg: string; filename: string } | null>
}

export function createUseAssetBundleSession({ client, chooseSvg }: AssetBundleSessionHookDeps) {
  return function useAssetBundleSessionAdapter() {
    const [snapshot, setSnapshot] = useState<AssetBundleSessionSnapshot>(EMPTY_SNAPSHOT)
    const [intentError, setIntentError] = useState<string | null>(null)
    const current = useRef(snapshot)

    useEffect(() => {
      return client.connect(
        (next) => {
          current.current = next
          setSnapshot(next)
          setIntentError(null)
        },
        (error) => {
          setIntentError(describeRpcFailure(error))
        },
      )
    }, [client])

    const submit = useCallback(
      async (intent: AssetBundleIntent): Promise<AcceptIntentResult> => {
        try {
          const result = await client.submit(intent)
          setIntentError(result.ok ? null : result.error)
          return result
        } catch (error) {
          const message = describeRpcFailure(error)
          setIntentError(message)
          return { ok: false, error: message }
        }
      },
      [client],
    )

    const begin = useCallback(
      (sourceSvg: string, filename: string) => submit({ kind: 'open-source', sourceSvg, filename }),
      [submit],
    )

    const drop = useCallback(
      async (file: File) => {
        await begin(await file.text(), file.name)
      },
      [begin],
    )

    const open = useCallback(async () => {
      const picked = await chooseSvg()
      if (picked !== null) {
        await begin(picked.svg, picked.filename)
      }
    }, [begin, chooseSvg])

    const patch = useCallback(
      (change: Partial<Settings>) => {
        const settings = current.current.desired?.settings
        if (isNil(settings) || isEqual(settings, { ...settings, ...change })) {
          return
        }
        void submit({ kind: 'patch-settings', change })
      },
      [submit],
    )

    const rename = useCallback(
      (bundleName: string) => submit({ kind: 'commit-bundle-name', bundleName }),
      [submit],
    )

    const setDarkMark = useCallback(
      (darkSvg: string, darkFilename: string) =>
        submit({ kind: 'set-dark-mark', darkSvg, darkFilename }),
      [submit],
    )

    const attachDarkMark = useCallback(
      async (file: File) => setDarkMark(await file.text(), file.name),
      [setDarkMark],
    )

    const chooseDarkMark = useCallback(async () => {
      const picked = await chooseSvg()
      return picked === null ? null : setDarkMark(picked.svg, picked.filename)
    }, [chooseSvg, setDarkMark])

    const clearDarkMark = useCallback(() => {
      const darkSvg = current.current.desired?.darkSvg
      if (!isNil(darkSvg)) {
        void submit({ kind: 'clear-dark-mark' })
      }
    }, [submit])

    const retry = useCallback(() => {
      void submit({ kind: 'retry' })
    }, [submit])

    return {
      snapshot,
      intentError,
      drop,
      open,
      patch,
      rename,
      attachDarkMark,
      chooseDarkMark,
      clearDarkMark,
      retry,
    }
  }
}
