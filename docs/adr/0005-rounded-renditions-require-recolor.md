---
status: accepted
---

# Rounded Renditions require recolor

Rounding is available only while recolor is active, so the Color Pair supplies the
background being shaped. It applies to favicons, single-scheme SVGs, and ordinary
PNG Renditions; Apple-touch and maskable Renditions retain their square, opaque
canvases for platform masking. This narrows ADR 0003's opacity rule: a rounded
Rendition retains its colored surface behind the mark but permits transparent
corners outside that surface. Supporting rounding independently of recolor would
require defining an additional background treatment and is outside this feature.

Rounding is a separate opt-in with one fixed Apple-like squircle, not a tunable
corner radius or an exact reproduction of Apple's mask. Existing Bundles retain
their appearance. The whole mark is preserved, keeping existing padding unless
additional inset is required to fit the curve. Desktop and CLI share the behavior
and persist the choice in the Sidecar; an explicit CLI request without eligible,
active recoloring is an error.

Disabling recolor preserves the Color Pair, Primary Scheme, and Rounded Corners
choice. A supplied Dark Mark suspends recolor and rounding without clearing those
choices. Stored colors therefore no longer imply that recolor is enabled; the
saved preference and its current availability are distinct. The rounding control
is hidden while recolor is inactive and restores its selected state when active.

The Sidecar stores the recolor on/off choice independently of the remembered
Color Pair, preserving both across reopening. Preferences belong to the existing
Asset Bundle recall flow, not to unrelated Source Marks. Older Sidecars retain
their meaning: a Color Pair implies recolor is enabled, an absent or null pair
implies off, and an absent Rounded Corners setting means off.

The exported outline uses flat sides and continuous corner transitions, visually
matched to Apple's icon template. The Android preview keeps its separate generic
squircle mask; that more rounded launcher shape is not the exported preset.
