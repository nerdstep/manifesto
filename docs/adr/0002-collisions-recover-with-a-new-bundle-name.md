# Collisions recover with a new Bundle Name

When a requested Bundle Name points at an Asset Bundle from another Source Mark or at an
unknown non-empty folder, Manifesto chooses an available Bundle Name, writes there, and
explains the recovery inline instead of opening a collision dialog. The recovered name
becomes the Asset Bundle Session's actual Bundle Name, so the editable value and filesystem
folder never diverge.

## Considered Options

- Pause generation for a Replace, Save As, or Cancel dialog.
- Keep the requested Bundle Name visible while writing to a different folder.
- Recover automatically and update the actual Bundle Name.

## Consequences

Collision handling no longer pauses the generation queue. Manifesto never replaces files
owned by a different Source Mark or an unknown folder without a later, separately designed
explicit action.

Recovered names continue a trailing numeric suffix instead of nesting one: `acme` becomes
`acme-2`, while a later collision on `acme-2` becomes `acme-3`. Manifesto chooses the first
available number at or above the next suffix rather than filling earlier gaps.

Before allocating a new suffix, recovery inspects continuation candidates in numeric order
and reuses the first Asset Bundle whose Sidecar matches the Source Mark. This preserves
Sidecar recall across launches and prevents repeated drops from proliferating folders.

The host includes an inline recovery notice in session snapshots after changing a Bundle
Name. The notice remains visible for the rest of that Asset Bundle Session, is replaced by
any later recovery notice, and is never reduced to a transient toast.

The previous Replace, Save As, and Cancel collision dialog path is removed rather than kept
as a fallback. Automatic recovery is the only collision behavior; native dialogs remain only
for choosing files and the Output Root.
