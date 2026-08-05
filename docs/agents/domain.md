# Domain Docs

How engineering skills should consume this repo's domain documentation when exploring the
codebase.

## Before exploring, read these

- `CONTEXT.md` at the repository root
- Relevant decisions under `docs/adr/`

If either location does not exist, proceed silently. Domain-modeling workflows create these
files lazily when terms or decisions are resolved.

## File structure

Manifesto is a single-context repository:

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Use the glossary's vocabulary

When output names a domain concept in an issue, proposal, hypothesis, or test, use the term
defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If a needed concept is absent, reconsider whether it belongs to the domain or note the gap
for a domain-modeling session.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly rather than
silently overriding it.
