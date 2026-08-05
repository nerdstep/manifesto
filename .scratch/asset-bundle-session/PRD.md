Status: ready-for-agent

# Deepen the Asset Bundle Session Module

## Problem Statement

Editing one Source Mark currently spreads Asset Bundle Session coordination across the
webview, RPC contract, and host generation code. The webview constructs complete generation
requests, assigns revisions, ignores stale responses, maps transport failures, and adopts
collision redirects. The host independently assigns and compares revisions, serializes work,
coalesces pending requests, opens collision dialogs, and writes the Asset Bundle.

This split makes the session shallow: callers must understand most of its implementation to
use it correctly. The most timing-sensitive client behavior has no direct test surface, and
the same concurrency knowledge appears on both sides of the RPC seam. Failed attempts also
replace the last successful result in the interface even though that Asset Bundle may still
exist on disk.

## Solution

Introduce one framework-independent, host-owned Asset Bundle Session module. Each host module
instance owns zero or one active session. The webview submits semantic intent through a thin
RPC adapter and receives authoritative session snapshots through one ordered push stream.

The session represents the latest desired Asset Bundle state rather than a history of
commands. It privately assigns revisions, coalesces ordinary Settings edits, rejects stale
work, renders the newest desired state, resolves safe Bundle Names, and publishes new
committed state only after an atomic filesystem write succeeds.

The webview uses a focused Preact adapter to subscribe, submit intent, and expose convenient
callbacks. It does not compare revisions or arbitrate results. A generic RPC hook and TanStack
Query are not introduced.

Collisions no longer interrupt generation with a dialog. Manifesto automatically selects or
reuses a safe numeric Bundle Name, updates the authoritative Bundle Name, and displays a
persistent inline warning explaining the recovery.

## User Stories

1. As a user, I want opening a Source Mark to begin a new Asset Bundle Session, so that all
   subsequent edits clearly belong to that mark.
2. As a user, I want opening another Source Mark to replace the current session immediately,
   so that the app never mixes work from two marks.
3. As a user, I want an invalid new Source Mark to remain the active failed session, so that
   the app does not silently restore work I intentionally replaced.
4. As a user, I want Settings controls to update responsively, so that editing feels local
   even though the host owns the authoritative session.
5. As a user, I want rapid ordinary Settings edits to converge on the newest values, so that
   Manifesto does not render and write every intermediate keystroke.
6. As a user, I want Source Mark, Dark Mark, Bundle Name, Output Root, and retry actions to
   begin work promptly, so that consequential changes are not delayed by edit coalescing.
7. As a user, I want newer desired state to supersede queued work, so that obsolete
   Renditions are not needlessly committed.
8. As a user, I want a failed attempt to preserve the last successfully committed Asset
   Bundle, so that useful previews and the real written path remain available.
9. As a user, I want the interface to indicate when the visible committed Asset Bundle does
   not match my desired state, so that stale previews cannot be mistaken for the current
   settings.
10. As a user, I want newly rendered previews to appear only after their bytes are written
    successfully, so that previews always represent the committed Asset Bundle.
11. As a user, I want a failed render or write to require Try Again or a newer edit, so that
    Manifesto never repeats filesystem side effects without my action.
12. As a user, I want a retry to use my newest desired state, so that it cannot replay an
    obsolete revision.
13. As a user, I want changing Output Root to generate the Asset Bundle under the new root,
    so that the configured location takes effect immediately.
14. As a user, I want changing Output Root to leave previously written Asset Bundles
    untouched, so that Manifesto never moves or deletes files implicitly.
15. As a user, I want the prior committed path retained until the new Output Root commit
    succeeds, so that the interface describes actual disk state during the transition.
16. As a user, I want a same-Source-Mark Asset Bundle to update in place, so that re-opening
    the mark restores and continues its Sidecar settings.
17. As a user, I want a Bundle Name owned by a different Source Mark to recover
    automatically, so that generation remains safe without a modal interruption.
18. As a user, I want an unknown non-empty folder to recover automatically, so that Manifesto
    never assumes unfamiliar files are safe to replace.
19. As a user, I want automatic recovery to update the visible Bundle Name, so that the field
    and filesystem folder never diverge.
20. As a user, I want recovered names to continue numeric suffixes, so that repeated
    collisions produce `acme-2`, `acme-3`, and `acme-4` rather than nested suffixes.
21. As a user, I want reopening a previously recovered Source Mark to reuse its matching
    suffixed Asset Bundle, so that Sidecar recall works and duplicate folders do not
    proliferate.
22. As a user, I want an inline warning explaining an automatic Bundle Name recovery, so that
    I understand why the name changed.
23. As a user, I want the recovery warning to remain visible for the session, so that the
    explanation is not lost like a transient toast.
24. As a user, I want Bundle Name edits committed only on blur or Enter, so that incomplete
    drafts never trigger writes.
25. As a user, I want Escape to restore the authoritative Bundle Name, so that I can abandon
    an uncommitted draft.
26. As a user, I want invalid Bundle Name drafts explained inline, so that they never enter
    desired state or reach filesystem operations.
27. As a user, I want drag-and-drop and the native Source Mark picker to behave identically,
    so that the entry method does not change session semantics.
28. As a user, I want drag-and-drop and the native Dark Mark picker to behave identically, so
    that Dark Mark changes use one generation path.
29. As a user, I want the webview to reconnect to a host session that is still alive, so that
    a view refresh does not duplicate writes or discard in-memory state.
30. As a user, I want the app to remain single-document, so that no unsupported multi-session
    state appears in the interface.
31. As a maintainer, I want revision numbers and queue rules private to the host, so that
    changing coordination internals does not require webview changes.
32. As a maintainer, I want semantic intent at the session interface, so that callers do not
    reconstruct complete session state for every edit.
33. As a maintainer, I want snapshots to expose derived facts rather than revision numbers,
    so that the webview cannot accidentally arbitrate commits.
34. As a maintainer, I want native desktop capabilities outside the session module, so that
    the session remains independent of Electrobun and testable in process.
35. As a maintainer, I want one ordered snapshot stream for handshake and later changes, so
    that old request responses cannot overwrite newer pushed state.
36. As a maintainer, I want session tests to cross the same interface as production, so that
    concurrency behavior can change internally without rewriting tests.

## Implementation Decisions

- The Asset Bundle Session is a framework-independent host module with zero or one active
  session per instance.
- A new Source Mark immediately replaces the active session, including when initial
  validation or generation fails.
- The host is authoritative for desired state, attempt state, and committed state.
- Desired state contains the current Source Mark, optional Dark Mark, Settings, Bundle Name,
  and Output Root needed to produce the next Asset Bundle.
- Committed state contains only an Asset Bundle whose bytes completed the atomic filesystem
  write. It retains the written path and preview bytes required by the webview.
- Attempt state communicates whether work is inactive, underway, or failed, together with a
  user-facing failure when applicable.
- The session accepts one discriminated semantic-intent union. Intent variants cover opening
  a Source Mark, editing Settings, committing a Bundle Name, attaching or clearing a Dark
  Mark, changing Output Root, and retrying failed desired state.
- Callers do not provide session IDs, revision numbers, trigger categories, complete desired
  snapshots, or queue instructions.
- Numeric revisions, supersession checks, trigger classification, render invalidation, and
  coalescing are private implementation details.
- Ordinary Settings edits update desired state immediately and use a short host-owned quiet
  window before generation. The quiet-window duration is not part of the interface.
- Opening a Source Mark, retrying, attaching or clearing a Dark Mark, committing a Bundle
  Name, and changing Output Root bypass the ordinary edit quiet window.
- If work is already running, the module retains only the newest pending desired state.
- Intent submission returns promptly after acceptance or validation failure; it does not
  wait for rendering or writing.
- The host publishes authoritative snapshots whenever desired, attempt, committed, or
  recovery-notice state changes.
- The reconnect handshake requests publication through the same ordered snapshot stream and
  returns only acknowledgement.
- Snapshots expose whether committed state matches desired state instead of exposing revision
  numbers.
- The Preact adapter subscribes to snapshots, initiates the reconnect handshake, submits
  semantic intent, and exposes convenient view callbacks. It does not own coordination.
- Temporary form drafts may remain in the webview. Bundle Name is drafted locally, submitted
  on blur or Enter, reverted on Escape, and validated before intent submission.
- A generic RPC hook is not added because it would mirror the transport without hiding
  session behavior.
- TanStack Query is not added because generation is a coalescing filesystem-writing command,
  not cacheable remote state, and serial mutations would execute obsolete queued work.
- Native file and directory pickers, clipboard, reveal-in-folder, viewport refresh, logging,
  and window chrome remain host-shell capabilities outside the session module.
- Picker results and drag-and-drop both adapt into the same Source Mark, Dark Mark, and Output
  Root intents.
- Failed attempts never retry automatically. Retry or a newer edit begins a fresh private
  revision using the newest desired state.
- A failure preserves the previous committed Asset Bundle and marks it as not matching
  desired state.
- Rendered bytes remain private until the atomic commit succeeds. A failed write never
  publishes those bytes as committed state.
- Changing Output Root changes desired target state but never moves, renames, or deletes the
  previously committed Asset Bundle.
- Target inspection distinguishes missing or empty folders, matching Sidecars, different
  Source Marks, and unknown non-empty folders.
- Missing or empty targets use the requested Bundle Name. A matching Sidecar reuses the
  existing Asset Bundle and restores its Settings.
- Different-Source-Mark and unknown-folder collisions recover automatically; the modal
  Replace, Save As, and Cancel path is deleted.
- Recovery first scans numeric continuation candidates in order for a matching Source Mark
  Sidecar. It reuses the first match before allocating a new name.
- When no matching candidate exists, recovery chooses the first available number at or above
  the next suffix. A trailing numeric suffix is incremented rather than nested.
- The recovered Bundle Name becomes desired state and is used by subsequent edits.
- Recovery publishes a precise inline warning that persists for the Asset Bundle Session and
  is replaced only by a later recovery warning.
- The pure pipeline and atomic persistence implementation remain separate internal
  dependencies of the session module. Neither imports Preact, RPC, or Electrobun.
- The existing distinction between Render Settings and Manifest Settings remains. Metadata-
  only changes continue to reuse rendered bytes rather than rerasterizing Renditions.
- Existing webview purity and bundle-size constraints remain in force.
- The behavior must conform to the accepted Asset Bundle Session and collision-recovery ADRs.

## Testing Decisions

- The highest test seam is the Asset Bundle Session interface. Tests submit semantic intents
  and observe published snapshots plus filesystem outcomes.
- Good tests assert observable desired, attempt, committed, recovery, and written-file
  behavior. They do not assert private revisions, queue contents, timer handles, or internal
  helper calls.
- Session tests use a fake scheduler to deterministically exercise the quiet window,
  supersession, retry, and work already in progress.
- Session tests use controllable pipeline and persistence adapters or existing local
  substitutes so rendering completion and write failures can be ordered deliberately.
- Test opening a Source Mark, replacement by another Source Mark, and initial validation
  failure.
- Test rapid edits coalescing into the newest desired state and immediate intents bypassing
  the quiet window.
- Test stale work never becoming committed after a newer desired state is accepted.
- Test failures retaining the prior committed Asset Bundle and explicit retry using newest
  desired state.
- Test previews and written paths changing together only after atomic commit.
- Test Output Root changes leaving previous files untouched and retaining the previous
  committed path until success.
- Test every target classification: missing, empty, matching Sidecar, different Source Mark,
  and unknown non-empty folder.
- Test numeric continuation from unsuffixed and suffixed Bundle Names, including occupied
  candidates and non-filled earlier gaps.
- Test matching recovered Sidecar reuse before allocating a new suffix.
- Test recovered names entering desired state and persistent inline warnings appearing in
  snapshots.
- Test valid, invalid, empty, committed, and abandoned Bundle Name drafts through focused
  Preact adapter tests.
- Keep persistence transaction and rollback tests at the persistence implementation seam.
- Keep pipeline golden tests unchanged; they remain the test surface for Rendition bytes.
- Replace existing coordination tests tied to request queues, caller revisions, triggers, and
  collision-dialog redirects with session-interface behavior tests.
- Add a thin RPC adapter test proving accepted intent reaches the host session and snapshots,
  including handshake state, leave through the ordered push stream.
- Add a focused Preact adapter test proving subscription cleanup, reconnect handshake,
  semantic intent submission, and snapshot rendering.
- Retain purity tests ensuring the webview does not value-import host or pipeline code and the
  pipeline remains free of filesystem and UI dependencies.
- Run the repository's full formatting, type-aware lint, typecheck, and test gate.
- Build and check the webview bundle to confirm the 200 kB constraint remains satisfied.

## Out of Scope

- A generic `useRpc` abstraction.
- TanStack Query or another remote-state caching library.
- Multiple simultaneous Asset Bundle Sessions in one window.
- Multi-window session registries or cross-window synchronization.
- Persistence of an in-memory session across host process exit, app restart, or Electrobun
  rebuild-and-relaunch watch mode.
- Moving or deleting an Asset Bundle after Output Root changes.
- Explicit replacement of a different-Source-Mark Asset Bundle or unknown folder.
- Restoring the removed collision dialog as a fallback.
- Changes to the Modern Minimal Set, Rendition Treatments, Normalization, or golden output.
- Changes to Inference beyond moving its orchestration behind the session module.
- Reworking the CLI around the new session. The CLI may continue using the pure pipeline and
  persistence implementation directly unless a separate spec deepens that caller.
- Multi-document history, recents, registry, or reopening the previous session after a new
  Source Mark fails.
- True HMR support or session persistence across a full host relaunch.

## Further Notes

- `CONTEXT.md` defines Asset Bundle Session, Source Mark, Dark Mark, Asset Bundle, Bundle Name,
  Output Root, Inference, Sidecar, Rendition, and related vocabulary used by this spec.
- The accepted Asset Bundle Session ADR records latest-desired-state semantics, host
  authority, ordered snapshots, retry behavior, commit invariants, and interface decisions.
- The accepted collision-recovery ADR records automatic numeric recovery, matching Sidecar
  reuse, persistent inline warning behavior, and deletion of the modal collision path.
- Electrobun watch mode rebuilds and relaunches the whole app. The reconnect handshake covers
  only webview reconnection while the existing host process remains alive.
- The report and design discussion deliberately reject transport-level abstractions as the
  primary module. Depth comes from concentrating Asset Bundle Session behavior behind
  semantic intent and authoritative snapshots.
