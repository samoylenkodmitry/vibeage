# packages/content

Owns authored game content and content validation.

## Entry Points

- `skills.ts`: skill IDs, names, costs, timings, effects, and presentation metadata.
- `items.ts`: item IDs, stack behavior, consumables, and names.
- `zones.ts`: zone definitions and lookup helpers.
- `lootTables.ts` and `starterLootTables.ts`: loot sources.
- `world.ts`, `verticalSlice.ts`, and `zoneSpawnBudget.ts`: world/content bundle and budgets.
- `worldContentValidation.ts`: content invariants.

## Common Edits

- Keep IDs stable once persisted or sent over the protocol.
- Add validation before adding broad content sets.
- Do not duplicate content constants in server or client code.

## Tests

- `pnpm run check:content`
- `pnpm run typecheck:packages`
