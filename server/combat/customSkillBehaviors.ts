import { SKILLS } from '../../packages/content/skills.js';
import type { Cast } from './skillSystem.js';
import type { CombatWorld } from './worldContract.js';
import { emitEnemyUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';
import {
  addStatus,
  alliedPlayers,
  applyCustomDamage,
  blinkPast,
  emitMaybe,
  forceEnemyChase,
  healCombatant,
  hostileEntities,
  impactCenter,
  isEnemy,
  knockAway,
  moveCombatant,
  nearestHostile,
  pullIntoRange,
  pullToward,
  resolveCaster,
  suppressEnemyAggro,
  swapCombatants,
  targetOf,
} from './skillMechanicPrimitives.js';

export type CustomSkillBehavior = (cast: Cast, world: CombatWorld, now: number, outbound?: OutboundEventSink) => void;

/** Fallback rally radius when the skill / mob carries no explicit range. */
const WARBAND_HOWL_RADIUS = 60;

/**
 * Registered custom ability behaviors — the sanctioned escape hatch
 * (docs/ABILITY_SYSTEM.md §2b) for the rare ability the declarative
 * schema can't express. Each is referenced by id from a first-class
 * SkillDef (name + description shown in the wiki), and resolveCastImpact
 * runs the matching fn instead of the declarative resolution. Prefer
 * data; this map is the documented exception, not a parallel system.
 */
export const CUSTOM_SKILL_BEHAVIORS: Record<string, CustomSkillBehavior> = {
  /**
   * Warband Howl — rally every alive packmate in range onto the caster's
   * current target, regardless of their AI state. Bespoke because it
   * re-targets *existing* mobs (not a shape, not a spawn).
   */
  warbandHowl: (cast, world, now, outbound) => {
    const caster = world.getEnemyById(cast.casterId);
    const targetId = cast.targetId;
    if (!caster?.packId || !targetId) return;
    const radius = SKILLS[cast.skillId]?.range ?? caster.packAggroRadius ?? WARBAND_HOWL_RADIUS;
    for (const entity of world.getEntitiesInCircle(caster.position, radius)) {
      if (isEnemy(entity) && entity.id !== caster.id && entity.packId === caster.packId && entity.isAlive) {
        entity.targetId = targetId;
        entity.aiState = 'chasing';
        entity.chaseStartedAt = now;
        entity.patrolTarget = undefined;
        // Broadcast now — the rally mutates outside the AI tick, so the
        // state-machine change detection would otherwise miss it.
        if (outbound) emitEnemyUpdated(outbound, { id: entity.id, targetId: entity.targetId, aiState: entity.aiState });
      }
    }
  },
  rewindMark: (cast, world, now, outbound) => {
    const caster = world.getPlayerById(cast.casterId);
    if (!caster) return;
    const rewindAt = now - 4_000;
    const history = caster.posHistory ?? [];
    const anchor = [...history].reverse().find((p) => p.ts <= rewindAt) ?? history[0];
    const destination = anchor ? { x: anchor.x, y: caster.position.y, z: anchor.z } : caster.position;
    moveCombatant(caster, destination, world);
    caster.health = Math.min(caster.maxHealth, caster.health + (caster.maxHealth - caster.health) * 0.35);
    caster.mana = Math.min(caster.maxMana, caster.mana + (caster.maxMana - caster.mana) * 0.35);
    addStatus({ target: caster, type: 'rewindEcho', value: 1, durationMs: 1500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    emitMaybe(outbound, caster);
  },
  portalPair: (cast, world, now, outbound) => {
    const caster = world.getPlayerById(cast.casterId);
    const destination = cast.target ?? cast.targetPos;
    if (!caster || !destination) return;
    const anchor = { x: caster.position.x, z: caster.position.z };
    for (const entity of world.getEntitiesInCircle(anchor, 4.5)) {
      const ally = world.getPlayerById(entity.id);
      if (!ally?.isAlive) continue;
      const offset = { x: ally.position.x - anchor.x, z: ally.position.z - anchor.z };
      moveCombatant(ally, { x: destination.x + offset.x, y: ally.position.y, z: destination.z + offset.z }, world);
      addStatus({ target: ally, type: 'portalSickness', value: 1, durationMs: 750, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      emitMaybe(outbound, ally);
    }
  },
  gravityWell: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const center = impactCenter(cast, world);
    if (!caster || !center) return;
    const targets = hostileEntities(caster, world, center, 7);
    for (const target of targets) {
      pullToward(target, center, 5, world);
      addStatus({ target, type: 'slow', value: 45, durationMs: 3500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      applyCustomDamage({ caster, target, rawDamage: 90, cast, world, now, outbound });
    }
  },
  magmaChain: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    pullIntoRange(target, caster.position, 2.2, 9, world);
    addStatus({ target, type: 'burn', value: 5, durationMs: 5000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    if (isEnemy(target) && !isEnemy(caster)) {
      target.targetId = caster.id;
      target.aiState = 'chasing';
      target.chaseStartedAt = now;
    }
    applyCustomDamage({ caster, target, rawDamage: 150, cast, world, now, outbound });
  },
  mirrorSpell: (cast, world, now, outbound) => {
    const caster = world.getPlayerById(cast.casterId);
    if (!caster) return;
    addStatus({ target: caster, type: 'mirrorSpell', value: 70, durationMs: 6000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    emitMaybe(outbound, caster);
  },
  soulLink: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    const partner = hostileEntities(caster, world, target.position, 9).find((entity) => entity.id !== target.id);
    if (!partner) return;
    addStatus({ target, type: 'soulLink', value: 35, durationMs: 8000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id, linkedTargetId: partner.id });
    addStatus({ target: partner, type: 'soulLink', value: 35, durationMs: 8000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id, linkedTargetId: target.id });
    emitMaybe(outbound, target);
    emitMaybe(outbound, partner);
  },
  phaseStep: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    blinkPast(caster, target, 1.7, world);
    addStatus({ target: caster, type: 'evasion', value: 70, durationMs: 1500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    addStatus({ target: caster, type: 'afterimage', value: 1, durationMs: 1500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    applyCustomDamage({ caster, target, rawDamage: 150, cast, world, now, outbound });
    emitMaybe(outbound, caster);
  },
  terrainSigil: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const center = impactCenter(cast, world);
    if (!caster || !center) return;
    for (const target of hostileEntities(caster, world, center, 5)) {
      addStatus({ target, type: 'root', value: 1, durationMs: 2500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      applyCustomDamage({ caster, target, rawDamage: 60, cast, world, now, outbound });
    }
  },
  puppetMastery: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = cast.targetId ? world.getEnemyById(cast.targetId) : null;
    if (!caster || !target?.isAlive) return;
    suppressEnemyAggro(target, now, 3500);
    addStatus({ target, type: 'puppet', value: 1, durationMs: 3500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    applyCustomDamage({ caster, target, rawDamage: 120, cast, world, now, outbound });
  },
  momentumStrike: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    const speed = Math.hypot(caster.velocity?.x ?? 0, caster.velocity?.z ?? 0);
    const damage = Math.min(520, 160 + speed * 28);
    knockAway(target, caster.position, Math.min(6, 2 + speed * 0.35), world);
    applyCustomDamage({ caster, target, rawDamage: damage, cast, world, now, outbound });
  },
  duelistLunge: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    const impact = { x: target.position.x, z: target.position.z };
    blinkPast(caster, target, 1.1, world);
    addStatus({ target, type: 'marked', value: 1, durationMs: 4000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    applyCustomDamage({ caster, target, rawDamage: 210, cast, world, now, outbound });
    const secondary = nearestHostile(caster, world, impact, 4.25, target.id);
    if (secondary) {
      addStatus({ target: secondary, type: 'slow', value: 35, durationMs: 2500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      applyCustomDamage({ caster, target: secondary, rawDamage: 90, cast, world, now, outbound });
    }
    emitMaybe(outbound, caster);
  },
  delayedFate: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    addStatus({ target, type: 'fateDebt', value: 360, durationMs: 2500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    emitMaybe(outbound, target);
  },
  cloneSwap: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    const oldPos = { ...caster.position };
    world.spawnMinion?.('goblin', caster.level, oldPos, now, {
      namePrefix: 'Illusion',
      healthMultiplier: 0.18,
      damageMultiplier: 0,
      experienceMultiplier: 0,
      lootTableIdOverride: '',
    });
    blinkPast(caster, target, 2.2, world);
    addStatus({ target: caster, type: 'evasion', value: 65, durationMs: 2000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    applyCustomDamage({ caster, target, rawDamage: 100, cast, world, now, outbound });
    emitMaybe(outbound, caster);
  },
  phoenixLeap: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    blinkPast(caster, target, 1.25, world);
    addStatus({ target: caster, type: 'shield', value: 180, durationMs: 5000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    for (const enemy of hostileEntities(caster, world, { x: target.position.x, z: target.position.z }, 3.5)) {
      addStatus({ target: enemy, type: 'burn', value: 4, durationMs: 4500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      applyCustomDamage({ caster, target: enemy, rawDamage: enemy.id === target.id ? 180 : 90, cast, world, now, outbound });
    }
    emitMaybe(outbound, caster);
  },
  aegisRelay: (cast, world, now, outbound) => {
    const caster = world.getPlayerById(cast.casterId);
    if (!caster) return;
    for (const ally of alliedPlayers(world, { x: caster.position.x, z: caster.position.z }, 7)) {
      healCombatant(ally, 90);
      addStatus({ target: ally, type: 'shield', value: 160, durationMs: 6000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      if (ally.id !== caster.id) {
        pullIntoRange(ally, caster.position, 1.5, 3.5, world);
      }
      emitMaybe(outbound, ally);
    }
  },
  phasePrison: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    const center = impactCenter(cast, world);
    if (!caster || !target || !center) return;
    addStatus({ target: caster, type: 'arcaneCharge', value: 1, durationMs: 9000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    emitMaybe(outbound, caster);
    for (const enemy of hostileEntities(caster, world, center, 4.75)) {
      pullIntoRange(enemy, center, 0.75, 5, world);
      addStatus({ target: enemy, type: 'root', value: 1, durationMs: 2200, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      addStatus({ target: enemy, type: 'silence', value: 1, durationMs: 2200, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      applyCustomDamage({ caster, target: enemy, rawDamage: enemy.id === target.id ? 120 : 70, cast, world, now, outbound });
    }
  },
  tripwireVolley: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    const center = { x: target.position.x, z: target.position.z };
    for (const enemy of hostileEntities(caster, world, center, 4.5)) {
      if (enemy.id === target.id) {
        addStatus({ target: enemy, type: 'marked', value: 1, durationMs: 5000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
        addStatus({ target: enemy, type: 'root', value: 1, durationMs: 1800, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
        applyCustomDamage({ caster, target: enemy, rawDamage: 190, cast, world, now, outbound });
      } else {
        knockAway(enemy, center, 2.5, world);
        addStatus({ target: enemy, type: 'slow', value: 35, durationMs: 2800, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
        applyCustomDamage({ caster, target: enemy, rawDamage: 80, cast, world, now, outbound });
      }
    }
  },
  guardianHook: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    pullIntoRange(target, caster.position, 1.8, 10, world);
    addStatus({ target: caster, type: 'shield', value: 220, durationMs: 6000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    emitMaybe(outbound, caster);
    for (const enemy of hostileEntities(caster, world, { x: caster.position.x, z: caster.position.z }, 5.5)) {
      forceEnemyChase(enemy, caster, now);
      addStatus({ target: enemy, type: 'taunt', value: 1, durationMs: 3500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      applyCustomDamage({ caster, target: enemy, rawDamage: enemy.id === target.id ? 130 : 60, cast, world, now, outbound });
    }
  },
  lifelineSwap: (cast, world, now, outbound) => {
    const caster = world.getPlayerById(cast.casterId);
    const ally = targetOf(cast, world);
    if (!caster || !ally || isEnemy(ally) || ally.id === caster.id || !ally.isAlive) return;
    swapCombatants(caster, ally, world);
    healCombatant(ally, 210);
    addStatus({ target: ally, type: 'shield', value: 180, durationMs: 6000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    addStatus({ target: caster, type: 'shield', value: 120, durationMs: 4500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    emitMaybe(outbound, ally);
    emitMaybe(outbound, caster);
  },
  projectileCapture: (cast, world, now, outbound) => {
    const caster = world.getPlayerById(cast.casterId);
    if (!caster) return;
    addStatus({ target: caster, type: 'projectileCapture', value: 1, durationMs: 6000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    emitMaybe(outbound, caster);
  },
};
