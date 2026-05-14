# server/world

Owns world orchestration after `server/world.ts` creates the authoritative runtime.

## Entry Points

- `tickPipeline.ts`: 30Hz phase runner for movement, AI, combat, snapshots, maintenance, and metrics.
- `clientMessageRouter.ts`: validated client command dispatch into domain handlers.
- `regions.ts`: server-owned regions, visibility scopes, and region stats.
- `zoneRuntime.ts`: global zone activation policy.

## Common Edits

- Add tick behavior by creating a domain function first, then calling it from `tickPipeline.ts`.
- Add client commands by updating protocol schemas, `roomBoundary.ts`, and `clientMessageRouter.ts` together.
- Change streaming by keeping spawning/activation global and limiting only per-client visibility.

## Tests

- `pnpm run check:server`
- `pnpm run check:protocol` when messages or snapshots change
