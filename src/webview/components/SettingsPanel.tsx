/**
 * The settings panel.
 *
 * Inferred values render exactly like typed ones — **no "inferred" badge**. A guess the
 * app is confident enough to write to disk is a guess it should be confident enough to
 * show plainly; marking it invites the user to audit five fields before they have any
 * reason to care about any of them.
 *
 * The fields are grouped by where they land, which is the answer to a question a user
 * should not have had to ask out loud: three colour swatches stacked identically gave no
 * hint that one of them redraws every icon and two only edit a JSON file.
 */

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

/**
 * A group of fields that all reach the same place.
 *
 * The grouping is the answer to a question a user should not have had to ask out loud:
 * three colour swatches stacked identically gave no hint that one of them redraws the
 * icons and two only edit a JSON file.
 */
function Group({
  title,
  note,
  tone = 'upstream',
  children,
}: {
  title: string
  note: string
  /**
   * Which half of the Signal Path this group belongs to. Cyan is what you are still
   * deciding; amber is where the result lands. The Bundle Name is the only setting on
   * this screen that names a destination rather than a value, so it is the only amber one.
   */
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
      {/*
        Exactly the fields in `RenderSettings`, minus `optimizeSvg` — which lives on the
        Source Mark row beside the byte delta and the pixel-drift verdict, the only place
        there is evidence to decide it with.

        The split is not cosmetic: these are the settings that force a re-render, and the
        render cache keys on them. If a field ever moves between these two groups, it has
        to move in `types.ts` first.
      */}
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

      {/* Exactly the fields in `ManifestSettings`. None of these touch a pixel. */}
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

      {/* Neither: the Bundle Name names the folder on disk and reaches no file at all. */}
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
