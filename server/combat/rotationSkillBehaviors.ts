import type { Cast } from './skillSystem.js';
import type { CombatWorld } from './worldContract.js';
import type { OutboundEventSink } from '../transport/outboundEvents.js';
import {
  activeStatus,
  addStatus,
  alliedPlayers,
  applyCustomDamage,
  applyReflectWard,
  applyStatusField,
  chainDamage,
  consumeStatus,
  damageHostilesInRadius,
  emitMaybe,
  forceEnemyChase,
  healCombatant,
  hostileEntities,
  impactCenter,
  isEnemy,
  knockAway,
  pullToward,
  removeStatusTypes,
  resolveCaster,
  shieldAlliesInRadius,
  spawnIllusionsAround,
  targetOf,
} from './skillMechanicPrimitives.js';

const CLEANSE_TYPES = ['burn', 'poison', 'dot', 'slow', 'freeze', 'stun', 'root', 'silence', 'waterWeakness', 'marked'];

export const ROTATION_SKILL_BEHAVIORS: Record<string, (cast: Cast, world: CombatWorld, now: number, outbound?: OutboundEventSink) => void> = {
  emberRelay: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    const burn = consumeStatus(target, 'burn', now);
    const chain = chainDamage({ caster, world, start: target, radius: 6, maxTargets: burn ? 5 : 3, rawDamage: burn ? 205 + burn.value * 14 : 140, falloff: 0.72, cast, now, outbound });
    for (const enemy of chain) {
      if (!enemy.isAlive || enemy.health <= 0) continue;
      addStatus({ target: enemy, type: 'burn', value: burn ? 6 : 3, durationMs: burn ? 7000 : 4500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      emitMaybe(outbound, enemy);
    }
    if (burn) {
      addStatus({ target: caster, type: 'attackSpeed', value: 16, durationMs: 4500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      emitMaybe(outbound, caster);
    }
  },
  seismicRend: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    const opened = Boolean(activeStatus(target, 'dot', now) || activeStatus(target, 'stun', now));
    const center = { x: target.position.x, z: target.position.z };
    for (const enemy of hostileEntities(caster, world, center, 5.25)) {
      pullToward(enemy, center, 3.5, world);
      addStatus({ target: enemy, type: 'dot', value: 5, durationMs: 6500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      if (opened) addStatus({ target: enemy, type: 'stun', value: 1, durationMs: enemy.id === target.id ? 1600 : 900, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      applyCustomDamage({ caster, target: enemy, rawDamage: enemy.id === target.id ? 170 : 95, cast, world, now, outbound });
    }
  },
  harmonicSeal: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const center = impactCenter(cast, world);
    if (!caster || !center) return;
    const targets = applyStatusField({
      caster,
      world,
      center,
      radius: 5.5,
      statuses: [{ type: 'slow', value: 35, durationMs: 3500 }, { type: 'silence', value: 1, durationMs: 1600 }],
      cast,
      now,
      outbound,
    });
    const primary = targetOf(cast, world);
    const anchor = primary ?? targets[0];
    const orderedTargets = anchor
      ? [...targets].sort((a, b) => {
          if (a.id === b.id) return 0;
          if (a.id === anchor.id) return -1;
          if (b.id === anchor.id) return 1;
          return distanceSq(a, anchor) - distanceSq(b, anchor);
        })
      : targets;
    const [first, second] = orderedTargets;
    if (first && second) {
      addStatus({ target: first, type: 'soulLink', value: 25, durationMs: 6500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id, linkedTargetId: second.id });
      addStatus({ target: second, type: 'soulLink', value: 25, durationMs: 6500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id, linkedTargetId: first.id });
    }
    shieldAlliesInRadius({ caster, world, center: { x: caster.position.x, z: caster.position.z }, radius: 7, value: 110, durationMs: 5500, cast, now, outbound });
    targets.forEach((enemy) => applyCustomDamage({ caster, target: enemy, rawDamage: 95, cast, world, now, outbound }));
  },
  nightfallNet: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    const primed = Boolean(activeStatus(target, 'marked', now) || activeStatus(target, 'poison', now));
    const center = { x: target.position.x, z: target.position.z };
    spawnIllusionsAround({ caster, world, now, center, count: 1, radius: 2.5, namePrefix: 'Nightfall Decoy' });
    for (const enemy of hostileEntities(caster, world, center, 4.5)) {
      addStatus({ target: enemy, type: enemy.id === target.id || primed ? 'root' : 'slow', value: enemy.id === target.id || primed ? 1 : 35, durationMs: primed ? 2600 : 1700, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      addStatus({ target: enemy, type: 'poison', value: enemy.id === target.id ? 6 : 3, durationMs: 6500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      addStatus({ target: enemy, type: 'marked', value: 1, durationMs: 6000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      applyCustomDamage({ caster, target: enemy, rawDamage: enemy.id === target.id && primed ? 185 : 105, cast, world, now, outbound });
    }
  },
  painDividend: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    const taunted = activeStatus(target, 'taunt', now);
    forceEnemyChase(target, caster, now);
    addStatus({ target, type: 'taunt', value: 1, durationMs: 4500, sourceSkill: cast.skillId, now, sourceCasterId: caster.id, linkedTargetId: caster.id });
    applyReflectWard({ target: caster, value: taunted ? 55 : 35, durationMs: 6500, cast, now, outbound, linkedTargetId: target.id });
    const hit = chainDamage({ caster, world, start: target, radius: 5, maxTargets: taunted ? 4 : 2, rawDamage: taunted ? 175 : 120, falloff: 0.7, cast, now, outbound });
    healCombatant(caster, Math.min(220, 45 * hit.length + (taunted ? 60 : 0)));
    emitMaybe(outbound, caster);
  },
  cinderHalo: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    if (!caster) return;
    const center = { x: caster.position.x, z: caster.position.z };
    const warded = Boolean(activeStatus(caster, 'shield', now) || activeStatus(caster, 'damageReflect', now));
    shieldAlliesInRadius({ caster, world, center, radius: 6, value: warded ? 170 : 115, durationMs: 6000, cast, now, outbound });
    for (const ally of alliedPlayers(world, center, 6)) {
      if (removeStatusTypes(ally, CLEANSE_TYPES, now) > 0) healCombatant(ally, 70);
      emitMaybe(outbound, ally);
    }
    damageHostilesInRadius({ caster, world, center, radius: 5.75, rawDamage: (enemy) => (warded ? 130 : 85) + (activeStatus(enemy, 'burn', now) ? 45 : 0), cast, now, outbound })
      .forEach((enemy) => {
        if (!enemy.isAlive || enemy.health <= 0) return;
        addStatus({ target: enemy, type: 'burn', value: warded ? 6 : 3, durationMs: 6000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
        emitMaybe(outbound, enemy);
      });
  },
  loadedMirage: (cast, world, now, outbound) => {
    const caster = resolveCaster(cast, world);
    const target = targetOf(cast, world);
    if (!caster || !target) return;
    const marked = activeStatus(target, 'marked', now);
    const center = { x: target.position.x, z: target.position.z };
    spawnIllusionsAround({ caster, world, now, center, count: marked ? 3 : 2, radius: 2.4, namePrefix: 'Loaded Mirage' });
    addStatus({ target: caster, type: 'reveal_loot', value: 1, durationMs: 9000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
    emitMaybe(outbound, caster);
    for (const enemy of hostileEntities(caster, world, center, 4.25)) {
      addStatus({ target: enemy, type: 'marked', value: 1, durationMs: 6000, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      if (marked) addStatus({ target: enemy, type: 'root', value: 1, durationMs: enemy.id === target.id ? 2300 : 1200, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      else addStatus({ target: enemy, type: 'slow', value: 35, durationMs: 2200, sourceSkill: cast.skillId, now, sourceCasterId: caster.id });
      if (isEnemy(enemy)) forceEnemyChase(enemy, caster, now);
      knockAway(enemy, center, enemy.id === target.id ? 0.8 : 1.6, world);
      applyCustomDamage({ caster, target: enemy, rawDamage: enemy.id === target.id && marked ? 175 : 95, cast, world, now, outbound });
    }
  },
};

function distanceSq(a: { position: { x: number; z: number } }, b: { position: { x: number; z: number } }): number {
  const dx = a.position.x - b.position.x;
  const dz = a.position.z - b.position.z;
  return dx * dx + dz * dz;
}
