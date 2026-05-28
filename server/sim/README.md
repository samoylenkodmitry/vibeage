# Server Simulation Harness

`gameSimulator.ts` is the scenario-level simulator for balance and progression
tests. It does not implement a second combat model. Each virtual tick drives the
same server systems used by the live world:

- player cast validation and cast execution
- mob AI state machines and mob skill casts
- movement integration
- projectile, impact, DoT, regen, death, XP, quest, and loot seams

Use `createGameSimulator()` for tests that need controlled teams, player AI
policies, and outcome metrics. Use `createSimWorld()` when a test needs the full
zone tick runner with production region and spawn behavior.

The first balance layer is split into:

- `playerPolicies.ts`: deterministic class/spec AI profiles and unlocked-skill
  helpers for simulated players.
- `scenarioCatalog.ts`: reusable PvE, PvP, quest-reward, loot-gold, and gear-set
  scenario catalogs.
- `playerFeel.ts`: player-feel cadence estimates over hour/day/week/month
  horizons, including meaningful progression beats, empty windows, dry gaps,
  and mitigation hints.
- `scripts/balance-sim.ts`: Markdown report over those catalogs. Run it with
  `pnpm run balance:sim`.

Typical scenario:

```ts
const sim = createGameSimulator();
const player = createSimulatedPlayer({ className: 'mage', level: 10 });
const mob = createSimulatedEnemy('goblin', 10);

sim.addPlayer(player, { teamId: 'players', policy: createClassCombatPolicy() });
sim.addEnemy(mob, { teamId: 'enemies' });

const result = sim.runUntil((s) => s.isCombatResolved(), { timeoutMs: 60_000 });
expect(result.summary.winnerTeamId).toBe('players');
```

Player AI is deliberately abstracted as `PlayerAiPolicy`. Keep policy code small
and deterministic. For future balance suites, build policies that model a player
style or class rotation, then run many content scenarios against them rather than
adding special logic to the simulator core.
