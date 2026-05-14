# server/combat

Owns authoritative casting, cooldowns, resources, impact resolution, projectiles, effects, and death handling.

## Entry Points

- `castHandler.ts`: top-level `CastReq` handling.
- `castRules.ts`: mana, cooldown, range, and target validation.
- `skillSystem.ts`: active cast ticking and cast snapshots.
- `impactResolver.ts`: impact damage/effects.
- `projectileRuntime.ts`: projectile movement and impact timing.
- `targetDeath.ts`: death side effects, XP, starter progress, and loot.

## Common Edits

- Pull skill numbers from `packages/content/skills.ts`.
- Put reusable deterministic math in `packages/sim`.
- Keep client VFX aligned with server-authored skill IDs and snapshots.

## Tests

- `pnpm run check:server`
- `pnpm run check:protocol` when combat messages change
