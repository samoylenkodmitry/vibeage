# VibeAge Roadmap

Last cleaned: 2026-05-14

## Direction

VibeAge is a browser-first multiplayer RPG prototype. Keep the game easy to run, easy for agents to modify, and built on proven libraries instead of custom engines where practical.

Current stack: Vite, React Three Fiber, Colyseus, Socket.IO compatibility paths, Postgres, shared protocol/content/simulation packages, Vitest, Playwright smoke checks.

Deployment target: VPS only. Production pulls from `origin/main` through the local deploy scripts.

## Current Baseline

- Main branch is production-affecting and deployed to `vibeage.eu`.
- The old `server` branch is retired.
- Server owns world activation, enemy spawning, combat, loot, and persistence.
- The client renders and predicts presentation only.
- Region activation is global; per-player logic may only scope streamed visibility.

## Completed This Batch

1. Region-scoped streaming
   - Bounded player, enemy, loot, and position snapshots per client stream.
   - Enemy spawn and activation remain independent of any specific player.
   - Scoped snapshot metrics and visibility tests are in place.

2. Client feel polish
   - Movement destination feedback, target readability, enemy state readability, and HUD viewport behavior improved.
   - Polish remains presentation-only; authoritative movement and combat stay server-side.

3. Legacy cleanup
   - Unused compatibility paths and old bootstrap-era modules removed.
   - Active skill code moved into a clear player-domain module.
   - `server/world.ts` is smaller and should stay orchestration-only.

## Next Plan

1. Migrate more public entity state to Colyseus schemas once the current event bridge is stable.
2. Split client UI into smaller domain components after the current HUD polish lands.
3. Continue deleting dead compatibility code and duplicated glue before adding major quest depth.
4. Expand the world size and encounter variety after streaming, input, and server code stay crisp under tests.
5. Add terrain or physics complexity only when gameplay needs it.

## Quality Gate

Before merge, prefer:

```bash
pnpm run check
```

For production changes, deploy locally and verify:

```bash
pnpm run deploy:production
pnpm run health:production
```
