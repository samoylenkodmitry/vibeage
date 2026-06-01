import type { AbilityShape, AbilityAffects } from '../../packages/content/abilitySchema.js';
import { classifySkill, type SkillDef } from '../../packages/content/skills.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import type { Cast } from './skillSystem.js';
import type { CombatWorld } from './worldContract.js';

type Combatant = Enemy | PlayerState;
const isEnemy = (t: Combatant): t is Enemy => 'type' in t;

/** Outer extent of a shape, for the broadphase circle query. */
function shapeOuterRadius(shape: AbilityShape): number {
  switch (shape.kind) {
    case 'single': return 0;
    case 'circle': return shape.radius;
    case 'donut': return shape.outerRadius;
    case 'cone': return shape.length;
  }
}

/** Is the offset `(dx,dz)` from the shape origin inside the shape? */
function insideShape(shape: AbilityShape, dx: number, dz: number, dirRad: number | undefined): boolean {
  const distSq = dx * dx + dz * dz;
  switch (shape.kind) {
    case 'single': return false;
    case 'circle': return distSq <= shape.radius * shape.radius;
    case 'donut': return distSq <= shape.outerRadius * shape.outerRadius && distSq >= shape.innerRadius * shape.innerRadius;
    case 'cone': {
      if (distSq > shape.length * shape.length || dirRad === undefined) return false;
      const half = (shape.halfAngleDeg * Math.PI) / 180;
      let delta = Math.atan2(dz, dx) - dirRad;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      return Math.abs(delta) <= half;
    }
  }
}

/** Whether `entity` is a valid target for `caster` under the allegiance filter. */
function matchesAffects(entity: Combatant, caster: Combatant | null, affects: AbilityAffects): boolean {
  if (affects === 'all') return true;
  if (affects === 'self') return caster ? entity.id === caster.id : false;
  const differentSide = isEnemy(entity) !== (caster ? isEnemy(caster) : false);
  return affects === 'enemies' ? differentSide : !differentSide;
}

/** Default allegiance when a skill doesn't declare `affects`. */
function inferAffects(skill: SkillDef): AbilityAffects {
  return classifySkill(skill.effects ?? []) === 'beneficial' ? 'allies' : 'enemies';
}

/**
 * Generic AOE-shape target selection (docs/ABILITY_SYSTEM.md). ONE
 * resolver for circle / donut / cone, anchored at the cast's locked
 * origin+direction (telegraphed) or the caster's current position, with
 * an allegiance filter. The SAME path serves a boss breath and a future
 * player cone — no entity-type branching.
 */
export function selectShapeTargets(
  cast: Cast,
  shape: AbilityShape,
  skill: SkillDef,
  world: CombatWorld,
  caster: Combatant | null,
): Combatant[] {
  const origin = cast.shapeOrigin ?? cast.pos ?? cast.origin;
  const affects = skill.affects ?? inferAffects(skill);
  let dirRad = cast.shapeDirRad;
  if (shape.kind === 'cone' && dirRad === undefined) {
    const t = cast.targetId ? (world.getEnemyById(cast.targetId) ?? world.getPlayerById(cast.targetId)) : null;
    if (t) dirRad = Math.atan2(t.position.z - origin.z, t.position.x - origin.x);
  }
  const out: Combatant[] = [];
  for (const entity of world.getEntitiesInCircle(origin, shapeOuterRadius(shape))) {
    if (entity.id === cast.casterId || !entity.isAlive) continue;
    if (!matchesAffects(entity, caster, affects)) continue;
    if (!insideShape(shape, entity.position.x - origin.x, entity.position.z - origin.z, dirRad)) continue;
    out.push(entity);
  }
  return out;
}

/**
 * Caster-side ability effects (docs/ABILITY_SYSTEM.md) resolved once per
 * cast on impact: blink (teleport behind the target) and summon (spawn
 * minions around the caster). Generic — a boss or a future summoner /
 * blink-rogue use the identical data.
 */
export function applyCasterEffects(caster: Combatant | null, cast: Cast, skill: SkillDef, world: CombatWorld, now: number): void {
  if (!caster) return;
  if (skill.blink) blinkBehindTarget(caster, cast, world, skill.blink.offset);
  if (skill.summon && world.spawnMinion) {
    const level = caster.level;
    for (let i = 0; i < skill.summon.count; i += 1) {
      const angle = (i / Math.max(1, skill.summon.count)) * Math.PI * 2;
      world.spawnMinion(skill.summon.type, level, {
        x: caster.position.x + Math.cos(angle) * skill.summon.radius,
        y: caster.position.y,
        z: caster.position.z + Math.sin(angle) * skill.summon.radius,
      }, now);
    }
  }
}

/** Teleport the caster to `offset` units on the far side of its target. */
function blinkBehindTarget(caster: Combatant, cast: Cast, world: CombatWorld, offset: number): void {
  const t = cast.targetId ? (world.getEnemyById(cast.targetId) ?? world.getPlayerById(cast.targetId)) : null;
  if (!t) return;
  const dx = t.position.x - caster.position.x;
  const dz = t.position.z - caster.position.z;
  const dist = Math.hypot(dx, dz);
  const ux = dist > 0.01 ? dx / dist : 1;
  const uz = dist > 0.01 ? dz / dist : 0;
  caster.position = { x: t.position.x + ux * offset, y: caster.position.y, z: t.position.z + uz * offset };
  caster.velocity = { x: 0, z: 0 };
  if (!isEnemy(caster)) {
    caster.movement = undefined;
  }
  // A blink is a teleport — flag the snap so the client jumps the caster
  // there instead of smooth-interpolating across the gap.
  caster.dirtySnap = true;
}
