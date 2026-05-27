# Unified offense — mobs own skills, spec is the single source of truth

Follow-on to `docs/ENGINE_ABSTRACTION.md`. That work unified **stats** (players and
mobs share one `EntityStats` block). This plan unifies **offense**: a combatant's
abilities are skills it owns, expressed in spec, cast through one pipeline, and
rendered in the wiki from the same spec the engine runs.

## 1. The asymmetry today

| | Player offense | Mob offense |
|---|---|---|
| Source | skills from the shared `SKILLS` registry (`packages/content/skills.ts`), owned via class/tree | a flat `Enemy.attackDamage` swing on `attackCooldownMs` |
| Resolution | `handleCastRequest → tickCasts → resolveCastImpact → applyCastToTarget → getDamage + applyResolvedDamageToTarget` | `applyEnemyAttack → applyResolvedDamageToTarget` (no skill, no element/effects/projectile) |
| Mini-bosses | — | a *separate* signature-mechanic engine (`server/ai/bossSignature.ts`: cone/donut/blink/summon + enrage/phase, configured by `bossConfig` + miniBosses content) |

Stats already read uniformly (`entity.stats.X`), but offense has **two-to-three**
parallel implementations. A goblin can't "cast poison spit" or "shield itself" the
way the skill system expresses player abilities, and the wiki/engine don't share one
offense spec.

## 2. Target architecture

**One skill registry, one cast pipeline, spec as the single source of truth.**

```
SKILLS registry (SkillDef)            ──┐
EnemyTemplate.skills: MobSkillRef[]  ──┼─► ENGINE: the mob AI selects a usable skill
PlayerState class/tree                ──┤    (off-cooldown, in-range, valid target) and
                                         │    casts it through the SAME pipeline players
                                         │    use (cast-time, projectiles, crit, element,
                                         │    effects, the shared damage resolver).
                                         └─► WIKI: renders every mob's full stat block +
                                              its skills directly from that spec.
```

- Mob offense stops being a flat number. A mob **owns skills** from the shared
  registry, exactly as a player owns them via class. Its "basic attack" becomes a
  skill; some mobs carry extra skills (poison spit, cleave, self-heal, ranged shot).
- The AI **decides** which skill to cast (rotation); the shared pipeline **resolves**
  it — so damage, element, effects, projectiles, and crit behave identically for
  players and mobs. No parallel offense path remains.
- Spec drives both readers: the **engine** reads `template.skills`; the **wiki**
  renders `template.skills` + the stat block. Completeness ("every mob in the wiki
  shows its stats and skills") becomes an enforced test.

## 3. Scope decisions (defaults; override in the goal if desired)

- **Bosses:** unify regular mobs first; fold the mini-boss signature mechanics
  (cone/donut/blink/summon) into the skill system as the **final phase** — it's the
  largest piece (the skill schema needs AOE-shape / telegraph support) and MAY split
  into its own goal. "All mob offense including bosses" is the aspiration; the phasing
  lets bosses land last or separately.
- **Mob resource:** cooldown-only — mobs have no mana pool; per-skill cooldown is the
  cadence lever. (Mob mana can be added later if a design wants it.)
- **Basic attack as a skill:** a mob's default attack becomes a skill whose damage
  derives from the mob's stats (unified scaling with players). This **re-baselines
  balance** — safe because the faithful simulator measures the real pipeline.

## 4. Build phases (each verified; parity preserved until the deliberate re-baseline in P4)

- **P1 — Spec: mobs own skills.** Add `skills` to `EnemyTemplate` (skill ids + optional
  per-mob usage hints: priority, cooldown override, when-to-use). Give every mob a
  basic-strike skill (damage from its stats); author extra skills for some mobs; add
  any mob-only skills to the shared `SKILLS` registry. The content audit validates
  every referenced skill id exists and every mob has ≥1 skill.
- **P2 — Engine: mobs cast skills.** Replace `applyEnemyAttack`'s flat swing with AI
  skill-selection + resolution through the shared cast/impact pipeline; track per-mob
  skill cooldowns. Mob damage now = skill base scaled by mob stats. (Boss signatures
  untouched this phase.)
- **P3 — Wiki from spec.** Extend `WikiMobs` (and `WikiBosses`) to render each mob's
  complete stat block + skill list from the spec. Add a test asserting **every**
  registered mob appears in the wiki data with a full stat block and its skills — the
  user-facing "all mobs described" check, enforced in CI.
- **P4 — Simulator + balance.** Mob offense flows through the real pipeline in the sim
  (mobs cast skills). Re-baseline golden parity (`tests/fixtures/combatBaseline.json`);
  re-tune to the balance target (`tests/combatBalanceTarget.spec.ts`); extend the
  balance tests for skill-using mobs.
- **P5 — Land.** Abstraction gate at 0; full `pnpm run check` green; PR → full CI green
  → squash-merge → deploy.
- **P6 (stretch / may split) — Bosses as skills.** Extend the skill schema for AOE
  shapes + telegraphs; express signature mechanics as skills; delete `bossSignature.ts`'s
  parallel path. Re-baseline boss encounters.

## 5. Landing gate — "no parallel offense remains"

The branch may not merge until ALL pass:

1. **Behavioral parity / target** — golden TTK/TTD baseline re-recorded and the
   `combatBalanceTarget` invariants hold on the faithful simulator (now with mobs
   casting skills).
2. **Wiki completeness** — a test proves every registered mob renders in the wiki with
   its full stat block and skill list, sourced from spec (no hand-authored duplication).
3. **Abstraction gate (0)** — no new `Date.now()`/`Math.random()`; mob offense reads the
   spec, not hardcodes; no surviving flat-`attackDamage` offense path.
4. **Full `pnpm run check`** — lint, typecheck (client/server/packages), scripts,
   maintainability, engine-abstraction, content, all tests — green.

## 6. Goal

> Unify combatant offense on one spec-driven skill system: mobs (and ultimately
> bosses) own skills from the shared registry, the engine casts them through the same
> pipeline players use, and the wiki renders every mob's full stats + skills from that
> single spec — completeness enforced by test, balanced via the simulator, landed on
> main.

## 7. Key files

- Skills: `packages/content/skills.ts` (`SkillDef`, `SKILLS`), `packages/content/skillTags.ts`.
- Mob spec: `packages/content/enemies.ts` (`EnemyTemplate`, `ENEMY_BASE_SCALING`, `resolveEnemyCombat`).
- Cast pipeline: `server/combat/{castHandler,skillSystem,impactResolver,damageResolution}.ts`.
- Mob AI: `server/ai/{enemyStateMachine,enemyBehavior,enemyAI}.ts` (`applyEnemyAttack` is the path to replace); `server/ai/bossSignature.ts` (boss phase).
- Wiki: `apps/client/src/hud/{WikiMobs,WikiBosses,WikiPanel}.tsx`.
- Simulator + balance: `server/sim/{combatBalance,simWorld}.ts`, `tests/{combatBaseline,combatBalanceTarget}.spec.ts`, `tests/fixtures/combatBaseline.json`.
- Gate: `scripts/check-engine-abstraction.mjs`.
