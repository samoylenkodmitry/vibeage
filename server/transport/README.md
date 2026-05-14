# server/transport

Owns the boundary between Colyseus clients and the authoritative world.

## Entry Points

- `vibeAgeRoom.ts`: Colyseus room lifecycle, public state sync, and snapshot resync.
- `colyseusRoomAdapter.ts`: validates client messages and scopes outbound messages per client.
- `clientSnapshot.ts`: sends join/resync snapshots and owner-only direct state.
- `clientState.ts`: builds sanitized and region-scoped game snapshots.
- `worldStateSchema.ts`: coarse public Colyseus room state.
- `roomBoundary.ts`: shared room constants and command lists.

## Common Edits

- New protocol messages must be runtime-validated before reaching world code.
- New player fields must be classified as public, region-scoped, or owner-only.
- Public room state should stay coarse; detailed state belongs in scoped snapshots/messages.

## Tests

- `pnpm run check:protocol`
- `pnpm run check:server`
