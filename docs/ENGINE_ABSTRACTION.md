# Engine Abstraction — spec-driven entities, generic systems, one clock

Goal: the engine runs **abstractions over entity characteristics**, never
per-mechanic or per-entity-type special cases. Every characteristic
(HP, regen, accuracy, evasion, defense, attack power, attack interval,
crit, …) is data on an entity, derived from that entity's **spec**.
The world simulator must drive the **same** systems the live server
runs — no parallel combat model. When this is done there are no
hardcoded constants standing in for entity data, no `?? baseline`
shared defaults, no `(x as PlayerState)` casts, and no second
implementation of any mechanic.

Status: **DESIGN — do not balance until the migration below is complete.**

---

## 1. What's wrong today (concrete)

| Smell | Where | Why it's wrong |
|---|---|---|
| Two parallel stat systems | players: `PlayerState.stats` (Contribution pipeline); mobs: ad-hoc `Enemy.attackDamage / accuracy? / attackCooldownMs / movementSpeed` | one concept ("a combatant's stats") has two shapes; combat must branch/cast to read either. |
| Shared code default for a per-entity stat | `enemy.accuracy ?? ACCURACY_BASELINE` in the damage path | accuracy is a *characteristic* — every mob should declare its own via its spec, not inherit a magic 90. |
| Type-test instead of characteristic | `(target as PlayerState).stats?.evasion ?? 0` | the engine asks "are you a player?" instead of "what is your evasion?". |
| Hardcoded "who regens" | `handleResourceRegeneration` iterates players only | regen should apply to any entity with an `hpRegen` characteristic; mobs that should regen can't. |
| Parallel combat implementation | `server/sim/combatBalance.ts` re-models auto-attack + regen | a second source of truth for "how combat works" — drifts from the real engine. |
| Wall clock in engine | `Date.now()` in skillSystem / impactResolver / createEnemy / regen | the simulator can't drive the real loop deterministically; time isn't injectable. |
| Two attack-initiation paths | player cast state-machine vs `applyEnemyAttack` | "perform an attack" is one concept; it has two code paths that must be kept in sync. |
| Mob stats computed inline | `createEnemy`: `(100+level*20)*template.health` etc. | a parallel stat formula separate from the Contribution pipeline players use. |

## 2. Target model

**Entity = identity + a derived characteristic block, built from a spec.**

```
Spec (pure data)                Stats / Characteristics (derived)        Engine
─────────────────               ─────────────────────────────           ──────
player: race+class+level         { maxHealth, hpRegen, mpRegen,          generic SYSTEMS run over
        +equipment+passives  ─►    accuracy, evasion, pDef, mDef,   ─►   any entity that has the
mob:    template+level            attackPower, attackIntervalMs,         relevant characteristic,
        +modifiers                critChance, critMult, moveSpeed,       driven by an injected Clock
boss:   template+phase             … }  (ONE shape for all)
```

- **One stat pipeline** (`buildContributions` / `computeAllStats`) produces the characteristic block for *every* combatant. Mobs get contributions from their template+level+modifiers exactly as players get them from race/class/equipment. `createEnemy`'s inline math is replaced by mob contributions.
- **One characteristic block** on every entity (`entity.stats`). Combat reads `attacker.stats.accuracy`, `target.stats.evasion`, `target.stats.pDef`, `entity.stats.hpRegen`, `attacker.stats.attackIntervalMs` — uniformly, no casts, no `?? baseline`. A characteristic absent from a spec is simply that spec's authored value (e.g. a mob with no regen authored = `hpRegen 0`).
- **Generic systems** (pure over `(world, clock)`), each keyed on a characteristic, not an entity type:
  - `DamageSystem` — resolve a hit from `attacker.stats` vs `target.stats` (accuracy/evasion → hit; pAtk/pDef → mitigation; crit; armor-pen; lifesteal; shield absorb). Already mostly unified in `applyResolvedDamageToTarget` + `getDamage`; finish it.
  - `RegenSystem` — every entity with `hpRegen`/`mpRegen` regenerates; no player/mob branch.
  - `CadenceSystem` — entities act on `attackIntervalMs` (auto-attack) / skill cooldowns; one scheduler.
  - `DotSystem`, `StatusEffectSystem`, `AISystem`, `MovementSystem` — same shape.
- **Clock injection.** A `Clock` interface (`now()`); the live loop passes a wall clock, the simulator passes `SimClock`. No `Date.now()` in engine modules. Existing `now`-parameter call sites already point this way; finish threading it.
- **The simulator runs the real systems.** The balance harness becomes: build entities from specs → register the real systems on a `SimClock` → advance → read state. The parallel combat model in `combatBalance.ts` is deleted.

## 3. Decision (locked)

- **Scope: everything-as-spec** — combat + vitals, AI tuning, aggro/leash, loot, spawn, movement all become spec data.
- **Atomic landing** — develop on a long-lived branch; merge once, squashed, only when the new engine is complete, the old code is deleted, and verification is green. A half-migration (old + new coexisting) is the explicit worst case to avoid.
- **No old code survives** — every parallel path / hardcode / shared default removed in the same landing.

## 4. The landing gate — how we prove "no old code lives"

The branch may not merge until ALL pass:

1. **Behavioral parity** (safety net for a live big-bang): snapshot the *current* engine's combat behaviour (balance-sim TTK/TTD + scenario snapshots) before the rewrite; the new engine must reproduce it within tolerance — proven by the simulator, no GPU needed.
2. **Static gate** (`check-engine-abstraction`, CI-enforced) fails on: `Date.now()` / `Math.random()` in engine modules; `?? <numeric-literal>` baselines in combat/stat code; `as PlayerState` / `as Enemy` casts in shared systems; imports of any deleted old module.
3. **Full suite + typecheck + lint + maintainability** green.

## 5. Build phases (all land together)

- **B0 — Baseline + gate.** Snapshot current behaviour; add the static gate (advisory first) so the old-code count is visible going to zero.
- **B1 — Unified characteristic block.** One `Characteristics` shape for every entity from one spec pipeline (player: race/class/level/equip/passives; mob: template/level/modifiers): accuracy, evasion, pDef, mDef, hp/mpRegen, attackPower, attackIntervalMs, crit, moveSpeed, aggro/leash, etc.
- **B2 — Clock + RNG injection** threaded through every system; `Date.now()`/`Math.random()` gone from the engine.
- **B3 — Generic systems** (Damage, Regen, Cadence, DoT, StatusEffect, AI, Movement, Loot, Spawn) as `(world, clock, rng) => events` keyed on characteristics, not types. One attack-resolution path.
- **B4 — Two drivers, one engine.** Live colyseus room + world simulator both call the same systems; the parallel `combatBalance.ts` model is deleted.
- **B5 — Delete + verify.** Remove all old paths; flip the gate to enforcing; parity + gates green → land.
