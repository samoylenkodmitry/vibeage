import { nanoid } from 'nanoid';
import type { SkillDef, SkillEffect } from '../../packages/content/skills.js';
import { SKILLS } from '../../packages/content/skills.js';
import { getNearestVillage } from '../../packages/content/villages.js';
import { getSpecializationById, PROFICIENCY_LEVEL } from '../../packages/content/specializations.js';
import { getDamage } from '../../packages/sim/combatMath.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { getSkillLevel, getSkillUpgradeModifiers } from '../../packages/sim/skillUpgrades.js';
import {
  emitEnemyUpdated,
  emitPlayerUpdated,
  emitServerMessage,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import type { Cast } from './skillSystem.js';
import type { CombatWorld } from './worldContract.js';
import { recomputePlayerStats } from '../players/playerStatsRefresh.js';

type ImpactContext = {
  caster: PlayerState | null;
  skill: SkillDef;
  outbound: OutboundEventSink;
  world: CombatWorld;
};

const NEGATIVE_EFFECT_TYPES: ReadonlySet<string> = new Set([
  'slow',
  'stun',
  'burn',
  'poison',
  'dot',
  'freeze',
  'waterWeakness',
]);

const BENEFICIAL_EFFECT_TYPES: ReadonlySet<string> = new Set([
  'heal',
  'shield',
  'bless',
  'dispel',
  'evasion',
  'invisible',
  // Escape: counts as beneficial so the impact resolver self-targets
  // the caster instead of demanding an enemy in range.
  'teleport',
]);

/**
 * §45.5 — apply one piercing-projectile hit. Calls the same damage
 * / status-effect / death pipeline as a full impact, but emits a
 * single-target CombatLog so the client can render each pierce hit
 * as it lands instead of one aggregated message at end-of-travel.
 *
 * Non-piercing projectiles still go through `resolveCastImpact` at
 * the Impact state transition; this is the per-hit path used by
 * `updateTravelingCast` while the projectile is still moving.
 */
export function applyProjectileHit(
  cast: Cast,
  target: Enemy | PlayerState,
  outbound: OutboundEventSink,
  world: CombatWorld,
): void {
  const skill = SKILLS[cast.skillId];
  const caster = world.getPlayerById(cast.casterId);
  const context: ImpactContext = { caster, skill, outbound, world };
  const upgradeDmgMult = getSkillUpgradeModifiers(skill.id, getSkillLevel(caster?.skillLevels, skill.id)).dmgMultiplier;
  const damage = calculateDamage(skill, caster, upgradeDmgMult, cast.castId, target.id, target);
  applyCastToTarget(target, damage, context);
  emitServerMessage(outbound, {
    type: 'CombatLog',
    castId: cast.castId,
    skillId: cast.skillId,
    casterId: cast.casterId,
    targets: [target.id],
    damages: [damage],
  });
}

export function resolveCastImpact(cast: Cast, outbound: OutboundEventSink, world: CombatWorld): void {
  const skill = SKILLS[cast.skillId];
  // §45.5 — for piercing projectiles, damage was applied per-hit
  // in `applyProjectileHit` while the projectile was traveling.
  // The Impact transition is purely cosmetic here; skip the area
  // resolve so we don't double-damage anyone, and skip the AOE
  // sweep since pierce projectiles don't carry one today.
  if (skill.projectile?.pierce && cast.pierceHits && cast.pierceHits.length > 0) {
    return;
  }
  const caster = world.getPlayerById(cast.casterId);
  const context = { caster, skill, outbound, world };

  const targets = resolveCastTargets(cast, world, skill, caster);
  // PR NN — Bless's damage multiplier is folded into `caster.stats.dmgMult`
  // by the Contribution registry (status-effect contribution). The cast
  // pipeline just reads dmgMult directly; no per-cast bless math.
  const upgradeDmgMult = getSkillUpgradeModifiers(skill.id, getSkillLevel(caster?.skillLevels, skill.id)).dmgMultiplier;
  const damages = targets.map((target) => calculateDamage(skill, caster, upgradeDmgMult, cast.castId, target.id, target));

  targets.forEach((target, index) => {
    applyCastToTarget(target, damages[index], context);
  });

  emitServerMessage(outbound, {
    type: 'CombatLog',
    castId: cast.castId,
    skillId: cast.skillId,
    casterId: cast.casterId,
    targets: targets.map((target) => target.id),
    damages,
  });
}

function isBeneficialOnly(skill: SkillDef): boolean {
  if (!skill.effects?.length) {
    return false;
  }
  return skill.effects.every((effect) => BENEFICIAL_EFFECT_TYPES.has(effect.type));
}

function resolveCastTargets(
  cast: Cast,
  world: CombatWorld,
  skill: SkillDef,
  caster: PlayerState | null,
): Array<Enemy | PlayerState> {
  // PR KK — selfTarget skills always land on the caster, even when
  // the player has another entity selected. Without this, casting
  // Vanish with a mob targeted routed the invisible / aggroReset
  // effects to the mob and the player kept getting hit.
  if (caster && skill.selfTarget) {
    return [caster];
  }
  if (caster && !cast.targetId && (!skill.area || skill.area <= 0) && isBeneficialOnly(skill)) {
    return [caster];
  }
  return getTargetsInArea(cast, world);
}

function calculateDamage(
  skill: SkillDef,
  caster: PlayerState | null | undefined,
  upgradeDmgMult: number,
  castId?: string,
  targetId?: string,
  target?: Enemy | PlayerState | null,
): number {
  if (!skill?.dmg) {
    return 0;
  }

  const baseStats = caster?.stats || { dmgMult: 1, critChance: 0, critMult: 2 };

  // Skill-upgrade multiplier is folded once per cast in resolveCastImpact
  // and passed in — keeps multi-target casts O(1) on the tier table
  // instead of O(targets) when leveled.
  const result = getDamage({
    caster: { ...baseStats, dmgMult: (baseStats.dmgMult ?? 1) * upgradeDmgMult },
    skill: { base: skill.dmg, variance: 0.1 },
    seed: `${castId || nanoid()}:${targetId || nanoid()}`,
  });

  // §45.4 — element vulnerability amplifier. Today only
  // `waterWeakness` exists; the generic shape is `<element>Weakness`
  // (the status-effect upsert path uses the same id). Extends
  // naturally to fireWeakness etc. once those effects ship.
  const elementMult = elementVulnerabilityMultiplier(skill, target);
  return result.dmg * elementMult;
}

const ELEMENT_TO_WEAKNESS_TYPE: Readonly<Record<string, string>> = {
  water: 'waterWeakness',
  // Future: fire → fireWeakness, ice → iceWeakness, etc. Add the
  // effect type to SkillEffectType (and the audit's
  // IMPLEMENTED_EFFECT_TYPES) at the same time.
};

function elementVulnerabilityMultiplier(skill: SkillDef, target?: Enemy | PlayerState | null): number {
  if (!skill.damageElement || !target?.statusEffects?.length) return 1;
  const weaknessType = ELEMENT_TO_WEAKNESS_TYPE[skill.damageElement];
  if (!weaknessType) return 1;
  const now = Date.now();
  let bonusPct = 0;
  for (const effect of target.statusEffects) {
    if (effect.type !== weaknessType) continue;
    const expiresAt = (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0);
    if (expiresAt <= now) continue;
    bonusPct += effect.value ?? 0;
  }
  return 1 + bonusPct / 100;
}

// PR NN — `blessDamageMultiplier` removed. Bless's damage tilt is
// now a regular Contribution (status-effect → dmgMult mul), folded
// into `player.stats.dmgMult` by `recomputePlayerStats`. The cast
// pipeline just reads `caster.stats.dmgMult` once; no per-cast
// bless math.

function getTargetsInArea(cast: Cast, world: CombatWorld): Array<Enemy | PlayerState> {
  const skill = SKILLS[cast.skillId];
  const targets: Array<Enemy | PlayerState> = [];
  const pos = cast.pos || cast.origin;

  if (cast.targetId) {
    const enemy = world.getEnemyById(cast.targetId);
    if (enemy?.isAlive) {
      targets.push(enemy);
    } else {
      // PvP: targetId can be another player. Damage / death flow
      // through the same Enemy|PlayerState path below.
      const otherPlayer = world.getPlayerById(cast.targetId);
      if (otherPlayer?.isAlive && otherPlayer.id !== cast.casterId) {
        targets.push(otherPlayer);
      }
    }
  }

  if (skill.area && skill.area > 0) {
    for (const entity of world.getEntitiesInCircle(pos, skill.area)) {
      if (entity.id !== cast.casterId && entity.isAlive && !targets.some((target) => target.id === entity.id)) {
        targets.push(entity);
      }
    }
  }

  return targets;
}

/**
 * §45.3 follow-up — evaluate spec-passive damage mitigation
 * predicates against the target's current HP (not the cached
 * stats snapshot, which only refreshes on level/equip/effect
 * changes). Returns a multiplier `≤ 1` on incoming damage.
 */
function targetDamageTakenMult(target: PlayerState): number {
  const spec = target.specializationId ? getSpecializationById(target.specializationId) : null;
  if (!spec) return 1;
  const hpFraction = target.maxHealth > 0 ? target.health / target.maxHealth : 1;
  if (hpFraction >= 0.5) return 1;
  const specMul = spec.specializationPassive.modifiers.belowHalfHpDamageTakenMultiplier ?? 1;
  const profMul = target.level >= PROFICIENCY_LEVEL
    ? (spec.proficiencyPassive.modifiers.belowHalfHpDamageTakenMultiplier ?? 1)
    : 1;
  return specMul * profMul;
}

/**
 * §45.3 follow-up — sum lifesteal percentages from the caster's
 * active spec passives. Proficiency-tier passives only count once
 * the player reaches `PROFICIENCY_LEVEL`. Returns 0 when no spec
 * is chosen or no passive supplies lifesteal.
 */
function casterLifestealPercent(caster: PlayerState | null | undefined): number {
  if (!caster?.specializationId) return 0;
  const spec = getSpecializationById(caster.specializationId);
  if (!spec) return 0;
  let pct = spec.specializationPassive.modifiers.lifestealPercent ?? 0;
  if (caster.level >= PROFICIENCY_LEVEL) {
    pct += spec.proficiencyPassive.modifiers.lifestealPercent ?? 0;
  }
  return pct;
}

function applyCastToTarget(
  target: Enemy | PlayerState,
  damage: number,
  context: ImpactContext,
): void {
  const { caster, skill, outbound, world } = context;
  // §45.3 follow-up — spec passives like Templar Knight's
  // Last Stand mitigate damage when the player is already below
  // half HP. Evaluated live against current HP because the stat
  // pipeline only recomputes on level/equip/effect changes —
  // health-fraction predicates would otherwise stay stale across
  // a fight.
  const mitigated = isEnemy(target) ? damage : damage * targetDamageTakenMult(target);
  const incoming = absorbWithShield(target, mitigated);

  target.health = Math.max(0, target.health - incoming);

  // §45.3 follow-up — Dark Avenger Sanguine Blade: hits restore
  // a small fraction of the post-mitigation damage as caster HP.
  // Applied per cast hit (AoE casts heal once per target). No-op
  // when the caster has no spec, isn't the right spec, or hit
  // for zero (no over-heal from misses).
  if (caster && incoming > 0 && caster.isAlive) {
    const pct = casterLifestealPercent(caster);
    if (pct > 0) {
      caster.health = Math.min(caster.maxHealth, caster.health + incoming * pct);
    }
  }

  // Damage-based aggro: don't retarget while a taunt is active — that
  // would let any other attacker break the taunt by hitting the mob,
  // defeating the whole point of the skill.
  if (isEnemy(target) && incoming > 0 && caster && target.isAlive && !isEntityTaunted(target)) {
    target.targetId = caster.id;
    target.aiState = 'chasing';
  }

  applySkillEffects(target, skill, caster, world);

  if (target.health <= 0 && target.isAlive && caster) {
    target.deathTimeTs = Date.now();
    world.onTargetDied(caster, target);
  }

  emitServerMessage(outbound, {
    type: 'EffectSnapshot',
    targetId: target.id,
    effects: target.statusEffects,
  });

  if (isEnemy(target)) {
    emitEnemyUpdated(outbound, target);
  } else {
    // PvP: broadcast the player's health change immediately so other
    // clients see the damage right away instead of waiting for the
    // next tick-pipeline snapshot.
    emitPlayerUpdated(outbound, {
      id: target.id,
      health: target.health,
      isAlive: target.isAlive,
      deathTimeTs: target.deathTimeTs,
      statusEffects: target.statusEffects,
      // Includes position so the Escape teleport reaches the client
      // without waiting for the next periodic PosSnap (which would
      // smooth-interp through the world from the cast spot).
      position: target.position,
    });
  }
}

function applySkillEffects(
  target: Enemy | PlayerState,
  skill: SkillDef,
  caster: PlayerState | null,
  world: CombatWorld,
): void {
  target.statusEffects = target.statusEffects ?? [];

  for (const effect of skill.effects ?? []) {
    if (effect.type === 'heal') {
      applyHealEffect(target, effect, caster);
      continue;
    }
    if (effect.type === 'dispel') {
      target.statusEffects = target.statusEffects.filter((existing) => !NEGATIVE_EFFECT_TYPES.has(existing.type));
      continue;
    }
    if (effect.type === 'aggroReset') {
      // PR KK — Vanish & friends. Scan a generous radius around the
      // target (= caster for selfTarget casts) and drop any enemy
      // that was chasing them. AGGRO_RESET_RADIUS easily covers a
      // mob's aggro range (default 15m) so we don't miss chasers
      // that haven't finished closing yet.
      applyAggroResetAround(target, world);
      continue;
    }
    if (effect.type === 'teleport') {
      // Engine-driven recall: any beneficial-only self-cast skill
      // with a 'teleport' effect routes the target (= caster) to the
      // nearest village that matches their level. No per-name check
      // — adding another recall skill is content-only. Same dirty-
      // snap pattern as devTeleport so the next PosSnap broadcasts.
      if (!isEnemy(target)) {
        const village = getNearestVillage(target.position, target.level);
        target.position = { ...village.position };
        target.velocity = { x: 0, z: 0 };
        target.movement = {
          isMoving: false,
          lastUpdateTime: Date.now(),
          speed: target.movement?.speed ?? 0,
        };
        target.dirtySnap = true;
      }
      continue;
    }
    if (effect.type === 'knockback') {
      // §45.4 — physical push along the caster→target vector. Bash /
      // powerStrike emit knockback with value = displacement in
      // world units. No-op for self-targets (vector is zero) and for
      // immovable bosses; otherwise the target snaps back and the
      // dirty-snap flag broadcasts the new position on the next tick.
      applyKnockback(target, caster, effect.value);
      continue;
    }
    upsertStatusEffect(target, effect, skill.id);
    // Taunt: force the enemy to focus the caster for the duration of
    // the effect. Damage-based aggro (above) is suppressed while
    // isEntityTaunted is true, so the caster keeps the lock.
    if (effect.type === 'taunt' && isEnemy(target) && caster) {
      target.targetId = caster.id;
      target.aiState = 'chasing';
    }
  }
}

function applyKnockback(target: Enemy | PlayerState, caster: PlayerState | null, distance: number): void {
  if (!caster || distance <= 0) return;
  if (target.id === caster.id) return;
  const dx = target.position.x - caster.position.x;
  const dz = target.position.z - caster.position.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1e-6) return;
  const nx = dx / len;
  const nz = dz / len;
  target.position = {
    x: target.position.x + nx * distance,
    y: target.position.y,
    z: target.position.z + nz * distance,
  };
  // Cancel any in-flight movement so the AI doesn't try to walk back
  // through the displacement vector on the same tick.
  target.velocity = { x: 0, z: 0 };
  if (!isEnemy(target)) {
    target.movement = {
      isMoving: false,
      lastUpdateTime: Date.now(),
      speed: target.movement?.speed ?? 0,
    };
  }
  target.dirtySnap = true;
}

/**
 * True when the entity carries an active taunt effect. Currently used
 * to suppress damage-based retargeting in applyCastToTarget so a
 * taunted enemy stays glued to its taunter for the effect duration.
 */
export function isEntityTaunted(entity: Enemy | PlayerState, now: number = Date.now()): boolean {
  return (entity.statusEffects ?? []).some((effect) => {
    if (effect.type !== 'taunt') return false;
    const expiresAt = (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0);
    return expiresAt > now;
  });
}

function applyHealEffect(target: Enemy | PlayerState, effect: SkillEffect, caster: PlayerState | null): void {
  // §45.3 follow-up — caster's heal-output multiplier applies on
  // top of the skill's listed value. Spec passives like Cardinal's
  // Greater Calling raise it via the Contribution registry; default
  // 1 (no amplification) for non-healer casters.
  const healMult = caster?.stats?.healMult ?? 1;
  const amount = effect.value * healMult;
  const max = isEnemy(target) ? target.maxHealth : target.maxHealth;
  target.health = Math.min(max, target.health + amount);
}

const AGGRO_RESET_RADIUS = 60;

/**
 * PR KK — drop every nearby enemy's threat on `target`. Used by
 * skills that carry an `aggroReset` effect (vanish today; future
 * smoke-bomb / cleanse-self). Scans world entities in a generous
 * radius around the target's current position and clears targetId
 * on any mob that was chasing them, returning the mob to idle.
 */
function applyAggroResetAround(target: Enemy | PlayerState, world: CombatWorld): void {
  const pos = { x: target.position.x, z: target.position.z };
  const id = target.id;
  for (const entity of world.getEntitiesInCircle(pos, AGGRO_RESET_RADIUS)) {
    if (!isEnemy(entity)) continue;
    if (entity.targetId !== id) continue;
    entity.targetId = null;
    entity.aiState = 'idle';
  }
}

function upsertStatusEffect(target: Enemy | PlayerState, effect: SkillEffect, skillId: string): void {
  const durationMs = effect.durationMs ?? 0;
  if (!durationMs) {
    return;
  }

  const statusEffect = {
    id: nanoid(),
    type: effect.type,
    value: effect.value,
    durationMs,
    startTimeTs: Date.now(),
    sourceSkill: skillId,
  };

  const stacking = effect as SkillEffect & { stackable?: boolean; maxStacks?: number };
  target.statusEffects = target.statusEffects ?? [];
  const existingIndex = target.statusEffects.findIndex((existing) => existing.type === effect.type);
  if (existingIndex >= 0) {
    const existing = target.statusEffects[existingIndex];
    if (stacking.stackable && existing) {
      target.statusEffects[existingIndex] = {
        ...statusEffect,
        stacks: Math.min((existing.stacks ?? 1) + 1, stacking.maxStacks ?? 1),
      };
    } else {
      target.statusEffects[existingIndex] = statusEffect;
    }
  } else {
    target.statusEffects.push(stacking.stackable ? { ...statusEffect, stacks: 1 } : statusEffect);
  }
  // PR NN — a stat-affecting buff (Bless, Slow, Shield, Evasion buff)
  // changes player.stats via the Contribution registry. Recompute
  // here so the next damage roll / regen tick / display reflects the
  // new buff immediately.
  if (!isEnemyEntity(target) && STAT_AFFECTING_EFFECTS.has(effect.type)) {
    recomputePlayerStats(target);
  }
}

const STAT_AFFECTING_EFFECTS: ReadonlySet<string> = new Set([
  'bless', 'slow', 'shield', 'evasion',
]);

function isEnemyEntity(target: Enemy | PlayerState): target is Enemy {
  return 'type' in target && 'spawnPosition' in target;
}

function absorbWithShield(target: Enemy | PlayerState, damage: number): number {
  if (damage <= 0) {
    return damage;
  }
  const effects = target.statusEffects;
  if (!effects?.length) {
    return damage;
  }
  let remaining = damage;
  for (const effect of effects) {
    if (effect.type !== 'shield' || effect.value <= 0) {
      continue;
    }
    const absorbed = Math.min(effect.value, remaining);
    effect.value -= absorbed;
    remaining -= absorbed;
    if (remaining <= 0) {
      break;
    }
  }
  target.statusEffects = effects.filter((effect) => effect.type !== 'shield' || effect.value > 0);
  return remaining;
}

function isEnemy(target: Enemy | PlayerState): target is Enemy {
  return 'type' in target;
}
