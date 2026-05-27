# Ability system — one expressive, data-driven vocabulary for every combatant

Follow-on to `docs/UNIFIED_OFFENSE.md`. That made mob offense *skills*; this makes
the **skill schema itself** expressive enough that no ability — player, mob, or
boss — needs a parallel implementation. `server/ai/bossSignature.ts` exists only
because the schema can't express four things; we fix the schema and delete it.

## 1. Why re-architect

A "boss-specific mechanic system" is the same smell as the old `applyEnemyAttack`:
power that should be **data** became **code**, so it's unavailable to everyone
else. The gaps that forced `bossSignature.ts`:

| Missing capability | Today |
|---|---|
| **cone / donut / line** AOE shapes | `SkillDef` has only `area` (a circle radius). |
| **telegraphed wind-up** delivery | delivery is instant or projectile; no "wind up `windUpMs`, show a telegraph, resolve on impact". |
| **blink** (teleport to/behind a target/point) | `teleport` effect = recall-to-village only. |
| **summon** | no summon effect at all. |

Consequence: no player can have a cone, a blink, a ground-telegraph, or a summon —
those are reachable only by being a boss. The fix unlocks a richer ability space
for **everyone** and removes the parallel system.

## 2. Target model — an ability is composable data

```
ability (SkillDef, extended) = {
  shape:    self | single | circle(r) | donut(inner,outer) | cone(range,halfAngle) | line(len,width)
  delivery: instant | projectile(speed,pierce) | telegraphed(windUpMs)   // wind-up → resolve shape at impact + client telegraph
  affects:  enemies | allies | self | all                                 // allegiance filter on the shape's hits
  onHit:    [ damage(weaponScaled|base, element, crit, pen, execute, lifesteal), <status effects…> ]
  caster:   [ blink(toTarget|behind|pos), summon(template,count), self-buff… ]
}
```

- **Generic resolvers, no entity-type branching.** One `selectTargetsInShape(shape,
  origin, dir, affects, world)`; the telegraphed-cast phase (wind-up → impact) on
  the existing cast state machine; `summon` / `blink` as caster-effects. Most of
  this exists in pieces (circle AOE in `resolveCastImpact`, the cast state machine,
  the `BossTelegraph` client renderer) — we unify and extend, not greenfield.
- **One vocabulary for all.** Vorthax's cone breath = `{shape:cone, delivery:telegraphed,
  affects:enemies, onHit:[damage(fire)]}`. A future mage cone is the *same data*.
  A rogue gets a real blink; a summoner class becomes authorable — all as content.

### 2b. Custom behaviors — the sanctioned, registered escape hatch

The data model will cover the vast majority; for the genuinely bespoke, a skill may
reference a **registered custom behavior** instead of forking into a hidden system:

- `SkillDef.customBehavior?: CustomBehaviorId` — resolved from one registry
  (`CUSTOM_SKILL_BEHAVIORS: Record<CustomBehaviorId, (cast, world, now, ctx) => void>`),
  all custom code in one place.
- A custom skill is **still a first-class `SkillDef`** with full metadata: `name`,
  `description`, tags, and a required human-readable behavior summary.
- The **wiki renders it like any skill** + a "★ custom" badge + its description, so
  nothing is hidden — "defined and described in the wiki".
- **Discipline (the anti-`bossSignature` rule):** prefer declarative; custom is the
  exception, registered and documented. Content audit enforces: every referenced
  `customBehavior` id resolves, and every custom skill carries a description.

## 3. Wiki — "used by" reverse index

Viewing a skill shows **who casts it**: classes (via tree / starter skills), mobs
(`EnemyTemplate.skills`), and bosses — as chips linking to those tabs. A reverse
index `skillUsers(skillId) → { classes, mobs, bosses }` is computed from the
existing ownership data. This also subsumes `UNLINKED.md`: the real orphan is a
skill with **zero** users anywhere.

## 4. Build phases (each verified; parity preserved until a deliberate boss re-baseline)

- **A1 — Schema + generic resolvers. ✅** `abilitySchema.ts` (shape circle/donut/cone +
  `anchor`, `affects`, `telegraph`, `summon`, `blink`) composed on `SkillDef`. Generic
  resolvers: `selectShapeTargets` (one resolver, all shapes + allegiance), telegraphed
  delivery (`lockTelegraph` + wind-up = cast time, resolve at impact), `applyCasterEffects`
  (blink/summon). Inert until content uses them — existing skills unchanged.
- **A2 — Custom-behavior registry. ✅** `SkillDef.customBehavior` + `CUSTOM_SKILL_BEHAVIORS`
  (resolveCastImpact runs the registered fn); audit pins every id resolves + is described.
- **A3 — Migrate bosses to skills. ✅** Each mini-boss signature is generated from its
  `MiniBossMechanic` into a real `SkillDef` (`bossSkills.ts`): circle/donut/cone →
  telegraphed shaped blast, blink → `BlinkSpec`, summonPack → the `warbandHowl` custom.
  The AI casts it on cooldown via the shared path; the telegraph is emitted by
  `castMobSkill`. Deleted `server/ai/bossSignature.ts` (enrage/phase → enemyStateMachine,
  now scaling `attackPower`) and the dead `applyEnemyAttack` (its coverage migrated onto
  the live cast path).
- **A4 — Wiki. ✅** Skills tab renders shape/delivery/telegraph/blink/summon/damageMult +
  a ★custom badge; `skillUsers(skillId)` reverse index → class/spec/mob/boss chips; a test
  pins every skill has ≥1 user (subsumes UNLINKED).
- **A5 — Simulator + balance. ✅** `makeSimMiniBoss` drives boss encounters (telegraphed
  signatures) through the real pipeline on SimClock; balance report gains a boss table;
  a test pins the signatures resolve in-sim and bosses stay killable.
- **A6 — Land. ✅** Gate 0 + full `pnpm run check` + PR → CI → merge → deploy.

## 5. Landing gate — "no parallel ability system"

1. No `bossSignature.ts`, no `applyEnemyAttack`; every ability resolves through the one
   pipeline (declarative resolvers or a registered custom behavior).
2. Every skill (incl. custom) renders in the wiki with its full description + "used by".
3. Abstraction gate 0; parity/balance target hold (re-baselined for bosses).
4. Full `pnpm run check` green.

## 6. Goal

> Re-architect skills into one expressive, data-driven ability vocabulary (shapes,
> telegraphed delivery, summon/blink), with a registered+documented custom-behavior
> escape hatch, so every combatant — player, mob, boss — draws from the same system;
> delete bossSignature.ts and applyEnemyAttack; the wiki describes every ability
> (custom included) and shows who uses each skill; balanced via the simulator, landed
> on main.

## 7. Key files

- Schema: `packages/content/skills.ts` (`SkillDef`, `SkillEffectType`), `packages/content/skillTags.ts`, `packages/content/mobSkills.ts`.
- Resolution: `server/combat/{impactResolver,skillSystem,projectileRuntime,damageResolution}.ts`; cast state machine in `skillSystem.ts`.
- Bosses (to migrate + delete): `server/ai/bossSignature.ts`, `packages/content/miniBosses.ts` (`MiniBossMechanic`, `bossConfig`).
- Dead path (to remove): `server/ai/enemyBehavior.ts` `applyEnemyAttack` + its 5 tests.
- Wiki: `apps/client/src/hud/{WikiPanel,WikiMobs,WikiBosses}.tsx`; telegraph render + protocol `BossTelegraph` → generic telegraph.
- Ownership for "used by": `server/players/playerProgression.ts` (class/starter), skill tree, `packages/content/enemies.ts` (`EnemyTemplate.skills`), `miniBosses.ts`.
