import { SKILLS } from '../../packages/content/skills.js';
import { nanoid } from 'nanoid';
import type { Enemy, PlayerState, StatusEffect } from '../../packages/sim/entities.js';
import type { VecXZ } from '../../packages/protocol/messages.js';
import type { Cast } from './skillSystem.js';
import type { CombatWorld } from './worldContract.js';
import { applyResolvedDamageToTarget } from './damageResolution.js';
import { emitCombatantUpdated } from './combatantUpdateEmitter.js';
import { emitEnemyUpdated, emitServerMessage, type OutboundEventSink } from '../transport/outboundEvents.js';

export type CustomSkillBehavior = (cast: Cast, world: CombatWorld, now: number, outbound?: OutboundEventSink) => void;

/** Fallback rally radius when the skill / mob carries no explicit range. */
const WARBAND_HOWL_RADIUS = 60;
type Combatant = Enemy | PlayerState;
type LinkedStatusEffect = StatusEffect & { linkedTargetId?: string };
type StatusInput = {
  target: Combatant;
  type: string;
  value: number;
  durationMs: number;
  sourceSkill: string;
  now: number;
  sourceCasterId?: string;
  linkedTargetId?: string;
};
type CustomDamageInput = {
  caster: Combatant;
  target: Combatant;
  rawDamage: number;
  cast: Cast;
  world: CombatWorld;
  now: number;
  outbound?: OutboundEventSink;
};

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
      if ('type' in entity && entity.id !== caster.id && entity.packId === caster.packId && entity.isAlive) {
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
    target.targetId = null;
    target.aiState = 'idle';
    target.aggroSuppressedUntilTs = now + 3500;
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
  projectileCapture: (cast, world, now, outbound) => {
    const caster = world.getPlayerById(cast.casterId);
    if (!caster) return;
    addStatus({ target: caster, type: 'projectileCapture', value: 1, durationMs: 6000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    emitMaybe(outbound, caster);
  },
};

function resolveCaster(cast: Cast, world: CombatWorld): Combatant | null {
  return world.getPlayerById(cast.casterId) ?? world.getEnemyById(cast.casterId);
}

function targetOf(cast: Cast, world: CombatWorld): Combatant | null {
  return cast.targetId ? (world.getEnemyById(cast.targetId) ?? world.getPlayerById(cast.targetId)) : null;
}

function impactCenter(cast: Cast, world: CombatWorld): VecXZ | null {
  const target = targetOf(cast, world);
  if (cast.target) return cast.target;
  if (cast.targetPos) return cast.targetPos;
  if (target) return { x: target.position.x, z: target.position.z };
  return cast.pos ?? cast.origin ?? null;
}

function hostileEntities(caster: Combatant, world: CombatWorld, center: VecXZ, radius: number): Combatant[] {
  const casterIsEnemy = isEnemy(caster);
  return world.getEntitiesInCircle(center, radius).filter((entity) => (
    entity.id !== caster.id && entity.isAlive && isEnemy(entity) !== casterIsEnemy
  ));
}

function addStatus(input: StatusInput): void {
  const { target, type, value, durationMs, sourceSkill, now, sourceCasterId, linkedTargetId } = input;
  const fresh: LinkedStatusEffect = { id: nanoid(), type, value, durationMs, startTimeTs: now, sourceSkill };
  if (sourceCasterId) fresh.sourceCasterId = sourceCasterId;
  if (linkedTargetId) fresh.linkedTargetId = linkedTargetId;
  target.statusEffects = [...(target.statusEffects ?? []).filter((effect) => effect.type !== type), fresh];
}

function moveCombatant(entity: Combatant, nextPos: Combatant['position'], world: CombatWorld): void {
  const oldPos = { x: entity.position.x, z: entity.position.z };
  entity.position = nextPos;
  entity.velocity = { x: 0, z: 0 };
  if (!isEnemy(entity)) entity.movement = undefined;
  entity.dirtySnap = true;
  world.moveEntity?.(entity.id, oldPos, { x: nextPos.x, z: nextPos.z });
}

function pullToward(entity: Combatant, center: VecXZ, maxDistance: number, world: CombatWorld): void {
  const dx = center.x - entity.position.x;
  const dz = center.z - entity.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= 0.01) return;
  const amount = Math.min(maxDistance, dist * 0.65);
  moveCombatant(entity, { x: entity.position.x + (dx / dist) * amount, y: entity.position.y, z: entity.position.z + (dz / dist) * amount }, world);
}

function knockAway(entity: Combatant, origin: VecXZ, distance: number, world: CombatWorld): void {
  const dx = entity.position.x - origin.x;
  const dz = entity.position.z - origin.z;
  const len = Math.hypot(dx, dz);
  if (len <= 0.01) return;
  moveCombatant(entity, { x: entity.position.x + (dx / len) * distance, y: entity.position.y, z: entity.position.z + (dz / len) * distance }, world);
}

function blinkPast(caster: Combatant, target: Combatant, offset: number, world: CombatWorld): void {
  const dx = target.position.x - caster.position.x;
  const dz = target.position.z - caster.position.z;
  const dist = Math.hypot(dx, dz) || 1;
  moveCombatant(caster, { x: target.position.x + (dx / dist) * offset, y: caster.position.y, z: target.position.z + (dz / dist) * offset }, world);
}

function applyCustomDamage(input: CustomDamageInput): void {
  const { caster, target, rawDamage, cast, world, now, outbound } = input;
  const applied = applyResolvedDamageToTarget(target, rawDamage, now, { kind: 'none', source: caster, world });
  if (target.health <= 0 && target.isAlive) world.onTargetDied(caster, target, now);
  if (outbound) {
    emitServerMessage(outbound, { type: 'CombatLog', castId: cast.castId, skillId: cast.skillId, casterId: cast.casterId, targets: [target.id], damages: [applied], crits: [false], misses: [false], heals: [0] });
    emitCombatantUpdated(outbound, target);
  }
}

function emitMaybe(outbound: OutboundEventSink | undefined, entity: Combatant): void {
  if (outbound) emitCombatantUpdated(outbound, entity);
}

function isEnemy(entity: Combatant): entity is Enemy {
  return 'type' in entity;
}
