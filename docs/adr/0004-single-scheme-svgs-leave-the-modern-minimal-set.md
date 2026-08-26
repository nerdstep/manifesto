# Single-scheme SVGs leave the Modern Minimal Set

When an Asset Bundle has both a light and a dark mark — supplied or derived —
Manifesto also writes `favicon-light.svg` and `favicon-dark.svg`. Neither appears in
the Head Snippet or the Web App Manifest.

## Considered Options

- Emit nothing; `favicon.svg` already carries both schemes.
- Emit both and reference them from commented-out Head Snippet lines.
- Emit both, unreferenced, only when two marks exist.

## Consequences

This is the first deliberate exception to the Modern Minimal Set, which otherwise
excludes any file no modern browser requests. The reason is not browser support: it
is that `favicon.svg`'s `prefers-color-scheme` block only resolves inside a browser,
and the same mark is needed in contexts that do no scheme switching at all — README
badges, social profiles, print, a design tool. Extracting one scheme from the dual
file by hand is error-prone.

A recolored mark takes its scheme's surface here, unlike `favicon.svg`, which stays
transparent because the tab it sits on supplies a color that already matches the
scheme. These files are for the contexts above, none of which supply one — a Derived
Mark alone on transparency in a README is the illegibility the Color Pair exists to
prevent. A supplied Dark Mark was painted for surfaces we do not know, so it keeps
its transparency.

Emission is conditional. Two byte-identical files named `-light` and `-dark` would
read as a bug, so a Bundle with one mark gets neither.

Commented-out Head Snippet lines were rejected: the Head Snippet is copy-paste
output, and dead markup in it invites someone to uncomment a file the browser will
not select correctly.
