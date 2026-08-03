# Product

## Register

product

## Audience

Manifesto is for developers who have a finished SVG and need the standard icon files for
a website. They know what favicons, touch icons, and maskable icons are. They should not
need to learn the app's internal vocabulary.

This is a short task in a larger project. The user wants to generate the files, check them,
and move on.

## Purpose

Manifesto turns one SVG into a complete set of website icons, a web app manifest, and the
`<head>` tags that reference them. It writes the files to a folder chosen by the user.

The app handles platform differences that are easy to miss.

- iOS places transparent touch icons on a black background.
- Android clips maskable icons to a circular safe zone.
- Small favicons lose detail when resized from a large raster image.

Success means the user can drop in a file, check the previews, copy the tags, and close the
app without reading documentation.

## Voice

Manifesto is precise, quiet, and trustworthy.

Use plain language and short sentences. State what happened, name the affected file or
folder, and give the next step when one is needed. Prefer familiar terms such as logo,
icon, and folder in the interface. Keep domain terms such as Source Mark, Rendition, and
Asset Bundle in code and technical documentation.

Avoid decorative punctuation and staged emphasis. Do not use em dashes to join thoughts.
Do not introduce explanations with a colon when a heading, list, or separate sentence is
clearer.

## Avoid

| Style | Example | Better approach |
| --- | --- | --- |
| Marketing language | Effortlessly generate stunning icons | State what the app creates |
| Impersonal errors | The operation could not be completed | Name the problem and a next step |
| Cutesy language | Oops! Something went wrong | Describe the failure without jokes or emoji |
| Developer output | EmptyMarkError or resvg parse failure | Explain the problem using file and artwork terms |
| Over-explanation | A paragraph defending a label or behavior | Keep only the information needed to act |

## Product principles

1. **Say what happened to the files.** Show whether files were written, skipped, or blocked.
   Include the path when it helps.

2. **Lead with the consequence.** Explain what the user will see before explaining the
   technical cause.

3. **Make warnings actionable.** Tell the user what to change. Do not show warnings that
   offer no useful next step.

4. **Show the generated file.** Previews use the bytes written to disk at the size used by
   the target platform.

5. **Treat inferred values as editable values.** Do not present them as recommendations or
   ask the user to confirm them.

## Interface constraints

The webview must not import host or pipeline code. This boundary is enforced by
`no-restricted-imports` in `.oxlintrc.json`. Type-only imports are allowed.

Keep the webview bundle below 200 kB. Prefer browser controls and native dialogs over new
webview dependencies.

## Accessibility

- Every control must work with a keyboard.
- The drop zone opens the file picker with Enter or Space.
- Every control needs a visible focus state and an accessible name.
- Generation results belong in a polite live region.
- Preview alt text should explain what the preview shows.
- Text and controls must meet WCAG AA contrast requirements.
