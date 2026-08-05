# Asset Bundle Sessions converge on the latest desired state

An Asset Bundle Session represents the latest desired Asset Bundle state rather than a
history of generation commands. Intermediate edits may be coalesced, superseded states must
not be committed, and a collision decision applies only after the session re-checks that it
is acting on the current revision; this keeps expensive rendering and filesystem writes from
replaying states the user no longer wants.

## Considered Options

- Queue and execute every generation command in order.
- Keep only the newest desired state and report which revision reached disk.
- Delegate request state to a generic `useRpc` hook or TanStack Query mutations.

## Consequences

The session module must own revisioning and stale-result rejection across rendering,
collision decisions, and commits. Adapters may submit intent, but cannot decide whether a
result is current. The session keeps desired state, committed state, and attempt state
distinct: a failed revision retains the last committed Asset Bundle and marks it as not
matching the current desired state. The host owns the authoritative session because it alone
can prevent a stale revision from reaching the filesystem; the webview renders session
snapshots and may keep temporary control drafts, but does not arbitrate commits.

The webview sends semantic intent instead of reconstructing complete session snapshots.
Revision assignment, trigger classification, state merging, render invalidation, and work
coalescing remain hidden in the host implementation.

A generic `useRpc` hook is rejected because it would mirror the transport without hiding
session behavior. TanStack Query is rejected because generation is a coalescing,
filesystem-writing command rather than cacheable remote state, and its serial mutation
scope executes every queued mutation instead of converging on the newest desired state.

Intent submission returns promptly after host acceptance or validation failure. Rendering,
target recovery, and commit continue asynchronously, and the host pushes authoritative
session snapshots whenever desired, attempt, or committed state changes. The webview does
not retain pending promises to arbitrate generation results.

Numeric revisions remain private to the host implementation. Snapshots expose derived facts
instead: desired values, the last committed Asset Bundle, whether it matches desired state,
the current attempt phase and failure, and any inline recovery notice.

Failed render or write attempts are not retried automatically. The session preserves the
desired state and last committed Asset Bundle until explicit retry or a newer edit starts a
fresh attempt; the failure clears only when a newer attempt succeeds or a new session begins.

Changing Output Root changes the desired commit target but never moves, renames, or deletes
an Asset Bundle committed under the previous root. Until the new target commits successfully,
the previous path remains the last committed state and is marked as not matching desired.

Opening a Source Mark ends the current Asset Bundle Session immediately, even when the new
mark fails validation or its first generation fails. Previously committed files remain on
disk, but the old session is not restored implicitly.

Ordinary Settings edits update desired state immediately but wait for a short host-owned
quiet window before generation. Opening a Source Mark, retrying, attaching or clearing a
Dark Mark, committing a Bundle Name, and changing Output Root bypass that window; if work is
already running, only the newest desired state remains pending.

Rendered bytes become committed state only after the atomic filesystem write succeeds.
Until then the webview keeps the previous committed previews, marked as not matching desired;
a write failure never publishes uncommitted bytes or replaces the last committed path.

Each host module instance owns zero or one active Asset Bundle Session. Opening a Source Mark
replaces it; callers do not provide session IDs, and multi-window support would create one
module instance per window rather than introduce a keyed session registry.

When a webview connects or reconnects while the host remains alive, its adapter subscribes
and requests the current snapshot before rendering session state. This is RPC reconnection
safety, not HMR or persistence across Electrobun's rebuild-and-relaunch watch mode.

The handshake publishes current state through the same ordered snapshot stream used for
later changes and returns only acknowledgement. The webview never reconciles a snapshot
response against independently pushed updates.

The host session module accepts one discriminated semantic-intent union. This concentrates
transition validation, revision assignment, quiet-window policy, and publication behind one
interface; the Preact adapter may expose convenient callbacks without widening that seam.

Native file and directory pickers, clipboard, reveal-in-folder, viewport workarounds,
logging, and window chrome remain host-shell capabilities outside the session module. Picker
results and drag-and-drop are adapters that produce the same Source Mark, Dark Mark, or
Output Root intents; the session implementation never imports Electrobun or opens dialogs.

Bundle Name keystrokes remain a webview control draft. Blur or Enter submits a valid name as
intent, Escape restores the authoritative snapshot value, and invalid or empty drafts never
enter desired state; other Settings edits remain live and use the host quiet window.

Tests move to the session interface: semantic intents enter through an in-memory adapter and
assert on published snapshots and committed filesystem results with a fake scheduler. Old
queue and revision tests are replaced, persistence transaction tests remain, and only thin
RPC and Preact adapter tests cover their respective seams.
