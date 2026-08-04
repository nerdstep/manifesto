import type { ComponentChildren } from 'preact'

import type { Settings } from '../../pipeline/index.ts'
import { ICON_FILENAMES } from '../../shared/bundle.ts'
import { ColorField, CommittedField, DarkMarkField, Field } from './fields.tsx'
import { Input, Note, SectionLabel } from './ui.tsx'
import type { Tone } from './ui.tsx'

type Props = {
  settings: Settings
  bundleName: string
  darkFilename: string | null
  onPatch: (change: Partial<Settings>) => void
  onRename: (bundleName: string) => void
  onDarkMark: (file: File) => void
  onChooseDarkMark: () => void
  onClearDarkMark: () => void
}

function Group({
  title,
  note,
  tone = 'upstream',
  children,
}: {
  title: string
  note: string
  tone?: Tone
  children: ComponentChildren
}) {
  return (
    <section class="mt-3 rounded-xl border border-line bg-surface p-4">
      <header class="mb-3.5">
        <SectionLabel tone={tone}>{title}</SectionLabel>
        <Note class="mt-0.5">{note}</Note>
      </header>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

export function SettingsPanel({
  settings,
  bundleName,
  darkFilename,
  onPatch,
  onRename,
  onDarkMark,
  onChooseDarkMark,
  onClearDarkMark,
}: Props) {
  return (
    <>
      <Group title="Icon files" note={`These settings redraw all ${ICON_FILENAMES.length} icons.`}>
        <ColorField
          label="Icon background"
          value={settings.iconBackground}
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
          hint="Name of the folder inside your output folder. Saved when you leave this field. It does not follow Name."
          onCommit={onRename}
        />
      </Group>
    </>
  )
}
