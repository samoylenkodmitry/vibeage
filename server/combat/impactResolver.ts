import { nanoid } from 'nanoid';
import type { SkillDef, SkillEffect } from '../../packages/content/skills.js';
import { SKILLS } from '../../packages/content/skills.js';
import { getNearestVillage } from '../../packages/content/villages.js';
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

export function resolveCastImpact(cast: Cast, outbound: OutboundEventSink, world: CombatWorld): void {
  const skill = SKILLS[cast.skillId];
  const caster = world.getPlayerById(cast.casterId);
  const context = { caster, skill, outbound, world };

  const targets = resolveCastTargets(cast, world, skill, caster);
  // Compute caster buffs once for the whole cast rather than per-target
  // (matters for multi-target skills like volley / waterSplash). The
  // skill-upgrade multiplier is constant per cast too, so hoist its
  // lookup alongside the bless multiplier instead of re-folding the
  // tier table for every target.
  const blessMult = blessDamageMultiplier(caster);
  const upgradeDmgMult = getSkillUpgradeModifiers(skill.id, getSkillLevel(caster?.skillLevels, skill.id)).dmgMultiplier;
  const damages = targets.map((target) => calculateDamage(skill, caster, blessMult, upgradeDmgMult, cast.castId, target.id));

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
  blessMult: number,
  upgradeDmgMult: number,
  castId?: string,
  targetId?: string,
): number {
  if (!skill?.dmg) {
    return 0;
  }

  const baseStats = caster?.stats || { dmgMult: 1, critChance: 0, critMult: 2 };

  // Skill-upgrade multiplier is folded once per cast in resolveCastImpact
  // and passed in — keeps multi-target casts O(1) on the tier table
  // instead of O(targets) when leveled.
  const result = getDamage({
    caster: { ...baseStats, dmgMult: (baseStats.dmgMult ?? 1) * blessMult * upgradeDmgMult },
    skill: { base: skill.dmg, variance: 0.1 },
    seed: `${castId || nanoid()}:${targetId || nanoid()}`,
  });

  return result.dmg;
}

/**
 * Sum bless-style damage tilts active on the caster into a single
 * multiplier. effect.value is a percentage (Bless: 25 → +25%); the
 * helper converts to (1 + value/100).
 *
 * KNOWN ISSUE: upsertStatusEffect replaces existing effects of the
 * same type (instead of stacking), so the additive loop here is
 * unreachable today — at most one 'bless' is ever active. Keeping the
 * sum so a later stacking-policy fix (Section 8 L520) lights up
 * bless stacking without re-touching this code. Balance is currently
 * tuned around the non-stacking behaviour; fixing both at once needs
 * a dedicated balance pass.
 */
function blessDamageMultiplier(caster: PlayerState | null | undefined): number {
  if (!caster?.statusEffects?.length) return 1;
  const now = Date.now();
  let pct = 0;
  for (const effect of caster.statusEffects) {
    if (effect.type !== 'bless') continue;
    const expiresAt = (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0);
    if (expiresAt <= now) continue;
    pct += effect.value ?? 0;
  }
  return 1 + pct / 100;
}

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

function applyCastToTarget(
  target: Enemy | PlayerState,
  damage: number,
  context: ImpactContext,
): void {
  const { caster, skill, outbound, world } = context;
  const incoming = absorbWithShield(target, damage);

  target.health = Math.max(0, target.health - incoming);

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
      applyHealEffect(target, effect);
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

function applyHealEffect(target: Enemy | PlayerState, effect: SkillEffect): void {
  const max = isEnemy(target) ? target.maxHealth : target.maxHealth;
  target.health = Math.min(max, target.health + effect.value);
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
