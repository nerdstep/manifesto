import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { Window } from 'happy-dom'
import { render } from 'preact'
import { act } from 'preact/test-utils'

import { bundleNameProblem } from '../src/shared/bundle-name.ts'
import type { AssetBundleIntent, AssetBundleSessionSnapshot } from '../src/shared/rpc.ts'
import { createAssetBundleSessionClient } from '../src/webview/asset-bundle-session-client.ts'
import { DropZone } from '../src/webview/components/DropZone.tsx'
import { CommittedField } from '../src/webview/components/fields.tsx'
import { SessionRecoveryNotice } from '../src/webview/components/SessionRecoveryNotice.tsx'
import { createUseAssetBundleSession } from '../src/webview/use-asset-bundle-session.ts'

const browser = new Window({ url: 'https://manifesto.test/' })

beforeAll(() => {
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: browser.document },
    window: { configurable: true, value: browser },
  })
})

afterAll(() => {
  Reflect.deleteProperty(globalThis, 'document')
  Reflect.deleteProperty(globalThis, 'window')
})

const emptySnapshot: AssetBundleSessionSnapshot = {
  desired: null,
  attempt: { kind: 'idle' },
  committed: null,
  matchesDesired: false,
  recoveryNotice: null,
}

type BrowserElement = ReturnType<typeof browser.document.createElement>
type BrowserInput = InstanceType<typeof browser.HTMLInputElement>

function inputIn(root: BrowserElement): BrowserInput {
  const input = root.querySelector('input')
  if (!(input instanceof browser.HTMLInputElement)) {
    throw new Error('Expected an input')
  }
  return input
}

function edit(input: BrowserInput, value: string): void {
  input.value = value
  input.dispatchEvent(new browser.Event('input', { bubbles: true }))
}

function testRoot(): BrowserElement {
  const root = browser.document.createElement('div')
  browser.document.body.append(root)
  return root
}

describe('Asset Bundle Session Preact adapter', () => {
  test('handshakes, renders pushed snapshots, submits intent, and unsubscribes', async () => {
    const accepted: AssetBundleIntent[] = []
    let handshakes = 0
    const client = createAssetBundleSessionClient({
      accept(intent) {
        accepted.push(intent)
        return Promise.resolve({ ok: true })
      },
      requestCurrent() {
        handshakes += 1
        return Promise.resolve()
      },
    })
    const useSession = createUseAssetBundleSession({
      client,
      chooseSvg: () => Promise.resolve(null),
    })
    const root = testRoot()

    function Harness() {
      const { snapshot, rename } = useSession()
      return (
        <button type="button" onClick={() => void rename('renamed')}>
          {snapshot.desired?.filename ?? 'empty'}
        </button>
      )
    }

    await act(() => {
      render(<Harness />, root)
    })
    expect(handshakes).toBe(1)
    expect(root.textContent).toBe('empty')

    const pushed = {
      ...emptySnapshot,
      desired: {
        sourceSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
        filename: 'logo.svg',
        darkSvg: null,
        darkFilename: null,
        settings: null,
        bundleName: 'logo',
        outputRoot: 'C:\\icons',
      },
    }
    await act(() => {
      client.receive(pushed)
    })
    expect(root.textContent).toBe('logo.svg')

    await act(() => {
      root.querySelector('button')?.click()
    })
    expect(accepted).toEqual([{ kind: 'commit-bundle-name', bundleName: 'renamed' }])

    await act(() => {
      render(null, root)
    })
    client.receive(emptySnapshot)
    expect(root.textContent).toBe('')
  })
})

describe('Source logo rejection', () => {
  test('a rejected replacement is visible instead of being hidden behind the current preview', async () => {
    const root = testRoot()
    await act(() => {
      render(
        <DropZone
          onFile={() => Promise.resolve()}
          onChoose={() => Promise.resolve()}
          busy={false}
          filename="logo.svg"
          sourceSvg='<svg xmlns="http://www.w3.org/2000/svg"/>'
        />,
        root,
      )
    })
    const transfer = new browser.DataTransfer()
    transfer.items.add(new browser.File(['png'], 'logo.png', { type: 'image/png' }))
    // happy-dom omits `ondrop`, so Preact keeps the JSX event's capitalized name.
    const drop = new browser.Event('Drop', { bubbles: true })
    Object.defineProperty(drop, 'dataTransfer', { value: transfer })

    await act(() => {
      root.querySelector('[role="button"]')?.dispatchEvent(drop)
    })

    const visibleStatus = root.querySelector('.signal-grid')
    expect(root.querySelector('#source-file-status')?.textContent).toContain(
      "That file isn't an SVG",
    )
    expect(visibleStatus?.textContent).toContain("That file isn't an SVG")
    expect(visibleStatus?.querySelector('img')).toBeNull()
  })
})

describe('Folder collision recovery', () => {
  test('the recovered folder name is announced in a prominent session status', async () => {
    const root = testRoot()
    await act(() => {
      render(
        <SessionRecoveryNotice notice="“logo” was already in use. Using “logo-2” instead." />,
        root,
      )
    })

    const status = root.querySelector('[role="status"]')
    expect(status?.textContent).toContain('Folder name changed')
    expect(status?.textContent).toContain('Using “logo-2” instead')
  })
})

describe('Bundle Name draft behavior', () => {
  test('valid blur and Enter drafts commit, while committed values resync', async () => {
    const commits: string[] = []
    const root = testRoot()
    const field = (value: string) => (
      <CommittedField
        label="Folder name"
        value={value}
        hint="Used for the generated folder."
        validate={bundleNameProblem}
        onCommit={(next) => {
          commits.push(next)
        }}
      />
    )
    await act(() => {
      render(field('logo'), root)
    })

    const input = inputIn(root)
    await act(() => {
      input.focus()
      edit(input, 'valid-name')
    })
    await act(() => {
      input.blur()
    })
    expect(commits).toEqual(['valid-name'])

    await act(() => {
      render(field('server-name'), root)
    })
    expect(inputIn(root).value).toBe('server-name')
    await act(() => {
      inputIn(root).focus()
      edit(inputIn(root), 'enter-name')
    })
    await act(() => {
      inputIn(root).dispatchEvent(
        new browser.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
    })
    expect(commits).toEqual(['valid-name', 'enter-name'])
  })

  test('invalid and empty drafts stay local, while Escape abandons a draft', async () => {
    const commits: string[] = []
    const root = testRoot()
    await act(() => {
      render(
        <CommittedField
          label="Folder name"
          value="logo"
          hint="Used for the generated folder."
          validate={bundleNameProblem}
          onCommit={(next) => {
            commits.push(next)
          }}
        />,
        root,
      )
    })
    const input = inputIn(root)

    await act(() => {
      input.focus()
      edit(input, '../invalid')
    })
    await act(() => {
      input.blur()
    })
    expect(commits).toEqual([])
    expect(root.textContent).toContain('without')

    await act(() => {
      edit(input, '')
      input.focus()
    })
    await act(() => {
      input.blur()
    })
    expect(commits).toEqual([])
    expect(root.textContent).toContain('Enter a folder name')

    await act(() => {
      edit(input, 'abandoned')
    })
    await act(() => {
      input.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(input.value).toBe('logo')
    expect(commits).toEqual([])
  })
})
