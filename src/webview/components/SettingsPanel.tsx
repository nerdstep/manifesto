import { isNil } from 'es-toolkit'
import type { ComponentChildren } from 'preact'

import type { ColorPair, Scheme, Settings } from '../../pipeline/index.ts'
import { bundleNameProblem } from '../../shared/bundle-name.ts'
import { iconFilenames } from '../../shared/bundle.ts'
import { ColorField, CommittedField, DarkMarkField, Field } from './fields.tsx'
import { RecolorField } from './RecolorField.tsx'
import { Button, Caption, Input, SectionHeading } from './ui.tsx'
import type { Tone } from './ui.tsx'

type Props = {
  settings: Settings
  bundleName: string
  darkFilename: string | null
  colorPairSeed: ColorPair | null
  onPatch: (change: Partial<Settings>) => void
  onRename: (bundleName: string) => void
  onDarkMark: (file: File) => void
  onChooseDarkMark: () => void
  onClearDarkMark: () => void
  onChooseOutput: () => void
  onOpenOutput: () => void
  canOpenOutput: boolean
  outputRoot: string
  recoveryNotice: string | null
}

function Group({
  title,
  note,
  tone = 'settings',
  children,
}: {
  title: string
  note: string
  tone?: Tone
  children: ComponentChildren
}) {
  return (
    <section>
      <SectionHeading note={note} tone={tone}>
        {title}
      </SectionHeading>
      <div class="grid grid-cols-1 gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2">
        {children}
      </div>
    </section>
  )
}

export function SettingsPanel({
  settings,
  bundleName,
  darkFilename,
  colorPairSeed,
  onPatch,
  onRename,
  onDarkMark,
  onChooseDarkMark,
  onClearDarkMark,
  onChooseOutput,
  onOpenOutput,
  canOpenOutput,
  outputRoot,
  recoveryNotice,
}: Props) {
  const recoloring = !isNil(settings.colorPair)
  const twoMarks = recoloring || !isNil(darkFilename)

  return (
    <>
      <Group
        title="Icon files"
        note={`These settings redraw all ${iconFilenames(twoMarks).length} icons.`}
      >
        <ColorField
          label="Icon background"
          value={settings.iconBackground}
          disabled={recoloring}
          note={recoloring ? 'Set by the two-color icons below.' : undefined}
          onChange={(iconBackground) => {
            onPatch({ iconBackground })
          }}
        />
        <DarkMarkField
          filename={darkFilename}
          onFile={onDarkMark}
          onChoose={onChooseDarkMark}
          onClear={onClearDarkMark}
        />
        {!isNil(colorPairSeed) && (
          <RecolorField
            seed={colorPairSeed}
            pair={settings.colorPair ?? null}
            primary={settings.primaryScheme ?? 'light'}
            onChange={(colorPair: ColorPair | null, primaryScheme: Scheme) => {
              onPatch({ colorPair, primaryScheme })
            }}
          />
        )}
      </Group>

      <Group
        title="Web app manifest"
        note="Browsers use these values when your site is installed or pinned. They do not change the icon files."
      >
        <Field label="Name">
          <Input
            type="text"
            value={settings.name}
            onInput={(event) => {
              onPatch({ name: event.currentTarget.value })
            }}
          />
        </Field>

        <Field label="Short name">
          <Input
            type="text"
            value={settings.shortName}
            onInput={(event) => {
              onPatch({ shortName: event.currentTarget.value })
            }}
          />
        </Field>

        <ColorField
          label="Theme color"
          value={settings.themeColor}
          onChange={(themeColor) => {
            onPatch({ themeColor })
          }}
        />

        <ColorField
          label="Splash background"
          value={settings.splashBackground}
          onChange={(splashBackground) => {
            onPatch({ splashBackground })
          }}
        />
      </Group>

      <Group title="Output" note="Where the files are written." tone="downstream">
        <CommittedField
          label="Folder"
          value={bundleName}
          hint="Name of the folder inside your output folder."
          validate={bundleNameProblem}
          notice={recoveryNotice}
          onCommit={onRename}
        />
        <div class="min-w-0">
          <Caption class="mb-1.5 block">Output folder</Caption>
          <div class="flex flex-wrap items-center gap-2.5">
            <Button onClick={onChooseOutput}>Choose output folder…</Button>
            {canOpenOutput && <Button onClick={onOpenOutput}>Open folder</Button>}
          </div>
          <p
            class="mt-2 truncate font-mono text-sm text-dim"
            title={outputRoot}
            aria-label={`Current output folder: ${outputRoot}`}
          >
            {outputRoot}
          </p>
        </div>
      </Group>
    </>
  )
}
