import { nanoid } from 'nanoid';
import type { SkillDef, SkillEffect } from '../../packages/content/skills.js';
import { SKILLS } from '../../packages/content/skills.js';
import { getMaxStacks, getStackingPolicy } from '../../packages/content/effects.js';
import { isCombatTraceEnabled, recordCombatTrace } from '../../packages/sim/combatTrace.js';
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
import { dispelTargetSet, evasionMissChanceFor } from './statusQueries.js';
import { applyResolvedDamageToTarget } from './damageResolution.js';

type ImpactContext = {
  caster: PlayerState | null;
  skill: SkillDef;
  outbound: OutboundEventSink;
  world: CombatWorld;
};

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
  const result = calculateDamage(skill, caster, upgradeDmgMult, { castId: cast.castId, targetId: target.id, target, world });
  const heal = applyCastToTarget(target, result.damage, context, result.miss);
  emitServerMessage(outbound, {
    type: 'CombatLog', castId: cast.castId, skillId: cast.skillId, casterId: cast.casterId,
    targets: [target.id], damages: [result.damage], crits: [result.crit], misses: [result.miss],
    heals: [Math.round(heal)],
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
  // §45.3 — Bless's damage multiplier is folded into `caster.stats.dmgMult`
  // by the Contribution registry (status-effect contribution). The cast
  // pipeline just reads dmgMult directly; no per-cast bless math.
  const upgradeDmgMult = getSkillUpgradeModifiers(skill.id, getSkillLevel(caster?.skillLevels, skill.id)).dmgMultiplier;
  const results = targets.map((target) => calculateDamage(skill, caster, upgradeDmgMult, { castId: cast.castId, targetId: target.id, target, world }));

  const heals = targets.map((target, i) => applyCastToTarget(target, results[i].damage, context, results[i].miss));
  emitServerMessage(outbound, {
    type: 'CombatLog', castId: cast.castId, skillId: cast.skillId, casterId: cast.casterId,
    targets: targets.map((target) => target.id),
    damages: results.map((r) => r.damage), crits: results.map((r) => r.crit),
    misses: results.map((r) => r.miss), heals: heals.map((h) => Math.round(h)),
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

type DamageContext = {
  castId?: string;
  targetId?: string;
  target?: Enemy | PlayerState | null;
  world?: CombatWorld;
};

function calculateDamage(
  skill: SkillDef,
  caster: PlayerState | null | undefined,
  upgradeDmgMult: number,
  ctx: DamageContext = {},
): { damage: number; crit: boolean; miss: boolean } {
  if (!skill?.dmg) return { damage: 0, crit: false, miss: false };
  const { castId, targetId, target, world } = ctx;
  const baseStats = caster?.stats || { dmgMult: 1, critChance: 0, critMult: 2 };
  const casterDmgMult = baseStats.dmgMult ?? 1;
  const result = getDamage({
    caster: { ...baseStats, dmgMult: casterDmgMult * upgradeDmgMult },
    skill: { base: skill.dmg, variance: 0.1 },
    seed: `${castId || nanoid()}:${targetId || nanoid()}`,
    // §52 #6 — explicit `evasion` buff rolls a dodge.
    targetMissChance: evasionMissChanceFor(target),
  });
  if (result.miss) return { damage: 0, crit: false, miss: true };
  const elementVulnMult = elementVulnerabilityMultiplier(skill, target);
  const casterElementMult = casterDamageElementMultiplier(skill, caster);
  const partyAuraMult = partyDamageAuraMultFor(caster, world);
  const final = result.dmg * elementVulnMult * casterElementMult * partyAuraMult;
  // §49/M4 PR016 — combat trace. crit factored out of varianceRoll.
  if (isCombatTraceEnabled()) {
    const critMult = baseStats.critMult ?? 2;
    const expanded = skill.dmg * casterDmgMult * upgradeDmgMult * (result.crit ? critMult : 1);
    recordCombatTrace({
      skillId: skill.id, casterId: caster?.id ?? null, targetId: targetId ?? null,
      baseDamage: skill.dmg, varianceRoll: expanded > 0 ? result.dmg / expanded : 1,
      casterDmgMult, upgradeDmgMult, isCrit: result.crit, critMult,
      elementVulnMult, casterElementMult, partyAuraMult, final,
    });
  }
  return { damage: final, crit: result.crit, miss: false };
}

// §45.3 — product of every other-player ally's party-damage aura
// within their declared radius. Stacks across allies + tiers.
function partyDamageAuraMultFor(caster: PlayerState | null | undefined, world: CombatWorld | undefined): number {
  if (!caster || !world) return 1;
  let mul = 1;
  for (const entity of world.getEntitiesInCircle({ x: caster.position.x, z: caster.position.z }, 30)) {
    if (entity.id === caster.id) continue;
    const ally = world.getPlayerById(entity.id);
    if (!ally?.specializationId) continue;
    const spec = getSpecializationById(ally.specializationId);
    if (!spec) continue;
    const tiers = ally.level >= PROFICIENCY_LEVEL
      ? [spec.specializationPassive.modifiers, spec.proficiencyPassive.modifiers]
      : [spec.specializationPassive.modifiers];
    for (const mods of tiers) {
      const auraMul = mods.partyDamageAuraMultiplier;
      const auraR = mods.partyDamageAuraRadiusM;
      if (!auraMul || auraMul === 1 || !auraR) continue;
      const dx = ally.position.x - caster.position.x;
      const dz = ally.position.z - caster.position.z;
      if (dx * dx + dz * dz > auraR * auraR) continue;
      mul *= auraMul;
    }
  }
  return mul;
}

function casterDamageElementMultiplier(skill: SkillDef, caster: PlayerState | null | undefined): number {
  if (!skill.damageElement || !caster?.specializationId) return 1;
  const spec = getSpecializationById(caster.specializationId);
  if (!spec) return 1;
  const specMap = spec.specializationPassive.modifiers.damageElementMultiplier;
  const profMap = caster.level >= PROFICIENCY_LEVEL
    ? spec.proficiencyPassive.modifiers.damageElementMultiplier
    : undefined;
  const specMul = specMap?.[skill.damageElement] ?? 1;
  const profMul = profMap?.[skill.damageElement] ?? 1;
  return specMul * profMul;
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

// §45.3 — `blessDamageMultiplier` removed. Bless's damage tilt is
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
      // PvP path: targetId can be another player. Self-cast lands
      // here too — client redirects beneficial casts to player.id.
      // Pre-fix a `!== casterId` guard dropped self; accept self
      // now so buffs actually land. No harmful cast routes here
      // (client never targets self for damage).
      const otherPlayer = world.getPlayerById(cast.targetId);
      if (otherPlayer?.isAlive) targets.push(otherPlayer);
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

// §45.3 follow-up — spec + proficiency tier multiplier on beneficial-buff durations.
function beneficialBuffDurationMultFor(caster: PlayerState | null | undefined): number {
  if (!caster?.specializationId) return 1;
  const spec = getSpecializationById(caster.specializationId);
  if (!spec) return 1;
  let mul = spec.specializationPassive.modifiers.beneficialBuffDurationMultiplier ?? 1;
  if (caster.level >= PROFICIENCY_LEVEL) {
    mul *= spec.proficiencyPassive.modifiers.beneficialBuffDurationMultiplier ?? 1;
  }
  return mul;
}

function isBeneficialEffectType(type: string): boolean {
  return BENEFICIAL_EFFECT_TYPES.has(type);
}

// §45.3 — caster spec poison-tick multiplier (spec × proficiency tier).
function poisonTickMultFor(caster: PlayerState | null | undefined): number {
  if (!caster?.specializationId) return 1;
  const spec = getSpecializationById(caster.specializationId);
  if (!spec) return 1;
  let mul = spec.specializationPassive.modifiers.poisonTickMultiplier ?? 1;
  if (caster.level >= PROFICIENCY_LEVEL) {
    mul *= spec.proficiencyPassive.modifiers.poisonTickMultiplier ?? 1;
  }
  return mul;
}

// §45.3 — sum lifesteal % from caster's spec passives (proficiency tier gated on PROFICIENCY_LEVEL).
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
  miss: boolean = false,
): number {
  const { caster, skill, outbound, world } = context;
  if (miss) return 0; // §52 #6 — dodged; CombatLog at call site carries miss=true.
  // Shared defensive pipeline — invuln, below-half-HP mitigation,
  // shield absorb, and the Resurrection 1-HP save all live in
  // `applyResolvedDamageToTarget` so enemy melee / boss signatures
  // run the identical math. Returns the amount that reached HP.
  const incoming = applyResolvedDamageToTarget(target, damage);

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

  const healApplied = applySkillEffects(target, skill, caster, world);
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
  return healApplied;
}

function applySkillEffects(
  target: Enemy | PlayerState,
  skill: SkillDef,
  caster: PlayerState | null,
  world: CombatWorld,
): number {
  target.statusEffects = target.statusEffects ?? [];

  let healApplied = 0;
  for (const effect of skill.effects ?? []) {
    if (effect.type === 'heal') {
      healApplied += applyHealEffect(target, effect, caster);
      continue;
    }
    if (effect.type === 'dispel') {
      const stripSet = dispelTargetSet(effect.dispelCategory ?? 'negative');
      target.statusEffects = target.statusEffects.filter((existing) => !stripSet.has(existing.type));
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
    upsertStatusEffect(target, effect, skill.id, caster);
    // Taunt: force the enemy to focus the caster for the duration of
    // the effect. Damage-based aggro (above) is suppressed while
    // isEntityTaunted is true, so the caster keeps the lock.
    if (effect.type === 'taunt' && isEnemy(target) && caster) {
      target.targetId = caster.id;
      target.aiState = 'chasing';
    }
  }
  return healApplied;
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

function applyHealEffect(target: Enemy | PlayerState, effect: SkillEffect, caster: PlayerState | null): number {
  // §45.3 — caster healMult (Cardinal etc) amplifies the skill value.
  // §52 #6 — return the applied delta (post-maxHealth cap) so the
  // CombatLog emit site can ship heals[] for client rendering.
  const amount = effect.value * (caster?.stats?.healMult ?? 1);
  const before = target.health;
  target.health = Math.min(target.maxHealth, target.health + amount);
  return target.health - before;
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

function upsertStatusEffect(target: Enemy | PlayerState, effect: SkillEffect, skillId: string, caster: PlayerState | null): void {
  const baseDuration = effect.durationMs ?? 0;
  if (!baseDuration) {
    return;
  }

  // §45.3 follow-up — Theurge Inspiration / future buff-duration
  // specs extend beneficial effect durations. Applied at upsert
  // time so the stored startTimeTs + scaled durationMs already
  // reflect the bonus; expiry logic stays untouched.
  const durationMs = isBeneficialEffectType(effect.type)
    ? Math.round(baseDuration * beneficialBuffDurationMultFor(caster))
    : baseDuration;

  // §45.3 follow-up — Phantom Ranger Venom / Plains Walker Toxin
  // scale poison tick damage at apply time so dotTicker reads the
  // already-amplified value. Other effect types pass through.
  const value = effect.type === 'poison'
    ? effect.value * poisonTickMultFor(caster)
    : effect.value;

  const statusEffect = {
    id: nanoid(),
    type: effect.type,
    value,
    durationMs,
    startTimeTs: Date.now(),
    sourceSkill: skillId,
    // Archwork #2 sub-work 2 — capture the applying entity so a
    // future DoT-kill credit path can read it. Optional because
    // self-applied effects (e.g. resurrection invuln) have no
    // outside owner.
    ...(caster ? { sourceCasterId: caster.id } : {}),
  };

  // §46/slice-2 — per-effect stacking policy from EFFECT_SPECS.
  const policy = getStackingPolicy(effect.type);
  target.statusEffects = target.statusEffects ?? [];
  const existingIndex = target.statusEffects.findIndex((e) => e.type === effect.type);
  if (existingIndex < 0) {
    target.statusEffects.push(policy === 'stack' ? { ...statusEffect, stacks: 1 } : statusEffect);
  } else {
    const existing = target.statusEffects[existingIndex]!;
    target.statusEffects[existingIndex] = reconcileExisting(existing, statusEffect, policy, effect.type);
    if (target.statusEffects[existingIndex] === existing) return; // 'reject' policy — keep existing untouched
  }
  // §45.3 — a stat-affecting buff (Bless, Slow, Evasion buff) changes
  // player.stats via the Contribution registry. Recompute here so the
  // next damage roll / regen tick / display reflects the new buff
  // immediately. Shield is absent — it's a pure absorb pool, not a
  // stat contribution.
  if (!isEnemyEntity(target) && STAT_AFFECTING_EFFECTS.has(effect.type)) {
    recomputePlayerStats(target);
  }
}

const STAT_AFFECTING_EFFECTS: ReadonlySet<string> = new Set([
  'bless', 'slow', 'evasion',
]);

// §46/slice-2 — applies the four stacking policies. Returns the
// existing entry unchanged for `reject` so the caller can detect it.
function reconcileExisting(
  existing: NonNullable<PlayerState['statusEffects']>[number],
  fresh: NonNullable<PlayerState['statusEffects']>[number],
  policy: ReturnType<typeof getStackingPolicy>,
  type: SkillEffect['type'],
): NonNullable<PlayerState['statusEffects']>[number] {
  if (policy === 'reject') return existing;
  if (policy === 'stack') {
    return { ...fresh, stacks: Math.min((existing.stacks ?? 1) + 1, getMaxStacks(type)) };
  }
  if (policy === 'refresh') {
    const remaining = Math.max(0, (existing.startTimeTs ?? fresh.startTimeTs) + (existing.durationMs ?? 0) - fresh.startTimeTs);
    return { ...existing, startTimeTs: fresh.startTimeTs, durationMs: Math.max(remaining, fresh.durationMs ?? 0), sourceSkill: fresh.sourceSkill };
  }
  return fresh; // 'replace'
}

function isEnemyEntity(target: Enemy | PlayerState): target is Enemy {
  return 'type' in target && 'spawnPosition' in target;
}

function isEnemy(target: Enemy | PlayerState): target is Enemy {
  return 'type' in target;
}
