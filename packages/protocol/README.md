# packages/protocol

Owns runtime-validated client/server message schemas and shared protocol types.

## Entry Points

- `clientMessages.ts`: client command schemas and types.
- `serverMessages.ts`: server message schemas and types.
- `common.ts`: shared schema atoms such as positions, inventory slots, casts, and effects.
- `parsing.ts`: safe parse helpers used at transport boundaries.
- `sessionEvents.ts`: Colyseus session event names.
- `starterProgress.ts`: starter path state schema.

## Common Edits

- Update schema and type together.
- Update server handling, client handling, and docs in the same change.
- Classify new server messages as public, region-scoped, or owner-only in `docs/PROTOCOL.md`.

## Tests

- `pnpm run check:protocol`
- `pnpm run typecheck:packages`
