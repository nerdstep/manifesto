/**
 * Shims for modules Electrobun's barrel re-exports but this app never uses.
 *
 * `electrobun/bun` re-exports `three` and `@babylonjs/core` for its WebGPU surface, and
 * because Electrobun ships TypeScript source rather than declarations, those imports are
 * typechecked as part of our compilation. `three` has no bundled types, so it fails with
 * an implicit-any error from a file we do not own.
 *
 * Importing from a deeper path would avoid both this and the ~9 MB they add to the
 * bundle, but Electrobun's `exports` map only publishes `.`, `./bun`, `./view` and
 * `./carrot` — there is no deeper entry to reach for. Revisit at Phase 8 if bundle size
 * matters; see docs/phase-0-findings.md.
 */

declare module 'three'
declare module '@babylonjs/core'
