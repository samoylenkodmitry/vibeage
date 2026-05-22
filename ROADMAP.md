# VibeAge Roadmap

Last rewritten: 2026-05-22

This is the **active roadmap** — current focus, principles, and quality gate. For:

- Shipped work and the original long-form rewrite plan → [docs/ROADMAP_HISTORY.md](docs/ROADMAP_HISTORY.md)
- Outstanding architecture debt + external audits → [docs/ARCHITECTURE_DEBT.md](docs/ARCHITECTURE_DEBT.md)

## Direction

VibeAge should become a browser-first multiplayer RPG with a very large fantasy world, server-owned simulation, mobile-friendly controls, and a world view that feels alive instead of a flat prototype grid.

Production target remains the VPS. `main` is production-affecting and deployment pulls from `origin/main` through local scripts.

## Non-Negotiables

- The server owns movement validation, region activation, enemy spawning, combat, loot, inventory, and persistence.
- The client renders presentation, local smoothing, input, HUD, and visual atmosphere only.
- Huge world content must not imply huge per-tick server work. Runtime activation, spawning, visibility, and broadcasts stay budgeted.
- Mobile must be playable in-browser without app install, keyboard, or desktop-only panels.
- Do not grow `server/world.ts`, `app/game/systems/SocketManager.tsx`, or current client state roots with new gameplay systems.
- Before merge, prefer `pnpm run check`.
- Before production deploy, use the local deploy script and `pnpm run health:production`.

## Current Baseline

- Stack: Vite, React Three Fiber, Colyseus, Postgres/Kysely, shared protocol/content/simulation packages, Vitest, Playwright.
- Region streaming already scopes direct server events per client-visible region.
- Server activation is global, not tied to any one player. Per-player logic only scopes visibility.
- Current world content is zone-based and content-validated, but the world is still visually flat and too small.
- Current mobile HUD has viewport checks, but mobile inventory and touch-first movement need more work.

## Active Focus

The **2026-05-22 Codex audit** (eight architecture items) landed in a single-day sprint of merges — every item is shipped end-to-end with regression tests. PR-by-PR breakdown lives in [docs/ARCHITECTURE_DEBT.md](docs/ARCHITECTURE_DEBT.md).

With the audit cleared, the next active slice is **§49/M2 onboarding polish** — first-hour player experience: tutorial hints, NPC dialog feedback, quest pacing. Trajectory of recent work (#306-#309) sits on this line.

Future architecture audits append to [docs/ARCHITECTURE_DEBT.md](docs/ARCHITECTURE_DEBT.md); future product slices append below this section.

## Quality Gate

Before merge:

```bash
pnpm run check
```

For production deployment:

```bash
pnpm run deploy:production
pnpm run health:production
```
