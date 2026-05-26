import { nanoid } from 'nanoid';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { getSpecializationById, PROFICIENCY_LEVEL } from '../../packages/content/specializations.js';

/**
 * Single defensive pipeline for *all* incoming damage — player casts
 * (PvP), enemy melee, and boss signatures all route a raw damage
 * number through `applyResolvedDamageToTarget`. Before this existed,
 * only the player-cast path (`applyCastToTarget`) ran shield absorb /
 * mitigation / invuln, so a shield buff or Templar Last Stand did
 * nothing against the common case — getting hit by a mob. The enemy
 * paths subtracted `attackDamage` straight off `health`.
 *
 * Order matters and mirrors the original cast-path logic:
 *   1. invuln (Phoenix Resurrection window) → zero damage.
 *   2. below-half-HP mitigation (Last Stand), players only, live-eval.
 *   3. shield absorb (drains the shield pool before HP, players + enemies).
 *   4. Resurrection save: a lethal hit snaps to 1 HP once per life.
 *
 * Returns the amount actually subtracted from `health` (post-shield,
 * post-cap) so the caller can credit lifesteal / report the number.
 */
export function applyResolvedDamageToTarget(target: Enemy | PlayerState, rawDamage: number): number {
  if (rawDamage <= 0) return 0;
  // Phoenix Knight Resurrection invuln window zeroes incoming damage.
  if (!isEnemy(target) && hasActiveInvuln(target)) {
    return 0;
  }
  // Spec passives (Templar Last Stand) mitigate when already below
  // half HP. Evaluated live against current HP — the stat pipeline
  // only recomputes on level/equip/effect changes, so an hpFraction
  // predicate would go stale across a fight.
  const mitigated = isEnemy(target) ? rawDamage : rawDamage * targetDamageTakenMult(target);
  let incoming = absorbWithShield(target, mitigated);

  // Phoenix Knight Resurrection: a hit that would kill snaps the
  // player to 1 HP and grants a brief invuln. One-shot per life.
  if (!isEnemy(target) && incoming >= target.health) {
    const saveMs = resurrectionInvulnMsFor(target);
    if (saveMs > 0 && !target.usedResurrectionThisLife) {
      target.usedResurrectionThisLife = true;
      incoming = Math.max(0, target.health - 1);
      upsertInvulnEffect(target, saveMs);
    }
  }

  target.health = Math.max(0, target.health - incoming);
  return incoming;
}

// §45.3 follow-up — live-eval mitigation against current HP, not a
// stale stats snapshot.
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

// §45.3 — active invuln (Phoenix Knight Resurrection) zeroes incoming damage.
export function hasActiveInvuln(player: PlayerState, now: number = Date.now()): boolean {
  return (player.statusEffects ?? []).some((e) => {
    if (e.type !== 'invuln') return false;
    return (e.startTimeTs ?? 0) + (e.durationMs ?? 0) > now;
  });
}

function resurrectionInvulnMsFor(target: PlayerState): number {
  if (!target.specializationId) return 0;
  const spec = getSpecializationById(target.specializationId);
  if (!spec) return 0;
  const specMs = spec.specializationPassive.modifiers.resurrectionInvulnMs ?? 0;
  const profMs = target.level >= PROFICIENCY_LEVEL
    ? (spec.proficiencyPassive.modifiers.resurrectionInvulnMs ?? 0)
    : 0;
  // Take the larger of the two so a spec that grants Resurrection at
  // both tiers uses the more generous window, not the sum.
  return Math.max(specMs, profMs);
}

function upsertInvulnEffect(target: PlayerState, durationMs: number): void {
  target.statusEffects = target.statusEffects ?? [];
  const existingIndex = target.statusEffects.findIndex((e) => e.type === 'invuln');
  const effect = {
    id: nanoid(), type: 'invuln', value: 1,
    durationMs, startTimeTs: Date.now(),
    sourceSkill: 'spec:resurrection',
  };
  if (existingIndex >= 0) {
    target.statusEffects[existingIndex] = effect;
  } else {
    target.statusEffects.push(effect);
  }
}

/**
 * Drains active `shield` status-effect pools before damage reaches
 * HP, in array order. Mutates the effects (decrements `value`) and
 * removes any shield that hits 0. Returns the unabsorbed remainder.
 */
export function absorbWithShield(target: Enemy | PlayerState, damage: number): number {
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
