# server/players

Owns player lifecycle, session handoff, progression, starter skills, and persistence-facing player state.

## Entry Points

- `playerSession.ts`: login, reconnect handoff, leave, socket lookup, and active persistence.
- `playerLifecycle.ts`: respawn and mana regeneration.
- `playerProgression.ts`: level, XP, skill normalization, and skill bar normalization.
- `playerSkills.ts`: learn skill and skill shortcut commands.

## Common Edits

- Reconnect-safe fields must round-trip through `server/persistence.ts`.
- Socket ownership checks belong before mutating player state.
- Starter path changes should stay consistent with `server/progression/starterPath.ts`.

## Tests

- `pnpm run check:server`
- `pnpm run db:restore:test` when persisted schema or migrations change
