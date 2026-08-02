# Product

## Register

product

## Users

Developers who ship websites and already know what a favicon, an apple-touch-icon and a
maskable icon are — but who do not know this app's internals, its domain vocabulary, or why
it emits seven files rather than forty.

Their context: they have a finished logo as an SVG and a site that needs icons. This is a
five-minute task standing between them and something else they actually care about. They
are not here to learn about icons; they are here to be done with icons.

The job: turn one SVG into every icon asset a website needs, correct on every platform,
without having to know what each platform demands.

## Product Purpose

Manifesto takes one Source Mark and produces a complete Asset Bundle — seven files plus the
`<head>` snippet that references them — on disk, in a folder the user chooses.

It exists because the platform requirements are unobvious and unforgiving, and getting them
wrong fails silently: transparency on an `apple-touch-icon` composites onto black in iOS; a
maskable icon that ignores the circular Safe Zone gets its corners cut off on a Pixel; a
downsampled 16px favicon turns to grey mush. None of these look wrong until they are on
someone's phone.

Success is the user dropping a file, glancing at the previews, and closing the app —
without reading documentation and without discovering a problem three weeks later.

## Brand Personality

**Precise, quiet, trustworthy.**

The interface states facts and gets out of the way. Confidence comes from accuracy, never
from tone — nothing is oversold, and nothing is softened. When the app has done something
to the user's files, it says exactly what; when it has declined to, it says why.

Voice: plain and instructive. Short declaratives. Explain the consequence before the
mechanism, because the consequence is what the reader is deciding about. Domain vocabulary
(Source Mark, Rendition, Safe Zone) is precise and load-bearing *in the codebase*, but the
interface should prefer the words the user already has.

## Anti-references

- **Marketing-speak.** "Effortlessly generate stunning icons!" No exclamation marks, no
  adjectives doing work that facts should do.
- **Enterprise / compliance tone.** "The operation could not be completed." Passive voice
  with no cause, no next step, and nobody accountable.
- **Over-friendly / cutesy.** "Oops! Something went wrong 😅" No emoji, no apologies, no
  jokes where an explanation belongs.
- **Raw developer output.** "EmptyMarkError: alpha scan returned null." Internal type names,
  library names, and stack-trace vocabulary must not reach the interface. The user did not
  choose resvg and should not have to know it exists.

## Design Principles

1. **Say what happened to their files.** This app writes to disk on every edit. Every write,
   every skipped write, and every collision is stated plainly, with the path. The user
   should never have to open a folder to find out what the app did.

2. **Explain the consequence, then the cause.** "Your icon will be invisible on iOS" comes
   before "transparency composites onto black". The reader is deciding whether to act, and
   only the consequence tells them.

3. **Every warning names an action.** A message the reader cannot act on is noise. If there
   is nothing to do about it, it is not worth saying.

4. **Show the artefact, not a description of it.** Previews render the bytes that were
   written, at the size the platform will use. A claim about the output is weaker than the
   output.

5. **Never claim more precision than we have.** Inferred values are presented as ordinary
   editable values, not as recommendations. Where the app is guessing, the guess is
   overwritable and unremarkable — it does not ask to be audited.

## Accessibility & Inclusion

- **Full keyboard operation.** Every control reachable and operable without a mouse. The
  drop zone specifically needs a keyboard path to choosing a file — dropping is currently
  the only way in, which makes the app's entry point mouse-only.
- **Screen reader support.** Real labels on every control, a live region announcing
  generation results ("Wrote 7 files to …"), and preview alt text that describes what the
  preview demonstrates rather than restating the filename.
- WCAG AA contrast (4.5:1 body, 3:1 large) is treated as a baseline in both themes rather
  than an explicit requirement.
