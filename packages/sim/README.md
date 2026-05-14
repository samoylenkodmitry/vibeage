# packages/sim

Owns deterministic simulation primitives that should not depend on React, Colyseus, Express, or Postgres.

## Entry Points

- `entities.ts`: shared entity shapes.
- `combatMath.ts`: deterministic combat and random helpers.
- `effects.ts`: status effect definitions.
- `geometry.ts` and `collision.ts`: pure spatial helpers.
- `authoritativeState.ts`: generic authoritative state shape.

## Common Edits

- Keep functions pure and easy to unit test.
- Move reusable server/client math here instead of duplicating it.
- Avoid browser, transport, and database imports.

## Tests

- `pnpm run typecheck:packages`
- `pnpm test -- vitest/combat.damage.test.ts vitest/effects.definition.test.ts tests/sim.geometry.spec.ts`
