import { describe, expect, it } from 'vitest';
import { selectShapeTargets } from '../server/combat/abilityShapes';
import type { Cast } from '../server/combat/skillSystem';
import type { SkillDef } from '../packages/content/skills';
import type { CombatWorld } from '../server/combat/worldContract';
import type { Enemy, PlayerState } from '../packages/sim/entities';

// Minimal entities — only the fields the shape resolver reads.
const mob = (id: string, x: number, z: number): Enemy =>
  ({ id, type: 'goblin', isAlive: true, position: { x, y: 0, z } } as unknown as Enemy);
const player = (id: string, x: number, z: number): PlayerState =>
  ({ id, isAlive: true, position: { x, y: 0, z } } as unknown as PlayerState);

function worldOf(entities: Array<Enemy | PlayerState>): CombatWorld {
  return {
    getEnemyById: (id) => (entities.find((e) => e.id === id && 'type' in e) as Enemy) ?? null,
    getPlayerById: (id) => (entities.find((e) => e.id === id && !('type' in e)) as PlayerState) ?? null,
    getEntitiesInCircle: () => entities,
    onTargetDied: () => undefined,
  } as unknown as CombatWorld;
}

const castAt = (origin: { x: number; z: number }, over: Partial<Cast> = {}): Cast =>
  ({ casterId: 'caster', skillId: 'x', origin, pos: origin, ...over } as unknown as Cast);

const shaped = (shape: SkillDef['shape'], affects: SkillDef['affects'] = 'enemies'): SkillDef =>
  ({ id: 'x', effects: [{ type: 'damage', value: 1 }], shape, affects } as unknown as SkillDef);

describe('selectShapeTargets — generic AOE shapes', () => {
  const caster = player('caster', 0, 0);

  it('circle selects enemies within the radius, excludes beyond + the caster', () => {
    const mobs = [mob('near', 3, 0), mob('far', 12, 0)];
    const hits = selectShapeTargets(castAt({ x: 0, z: 0 }), { kind: 'circle', radius: 5 }, shaped({ kind: 'circle', radius: 5 }), worldOf([caster, ...mobs]), caster);
    expect(hits.map((h) => h.id)).toEqual(['near']);
  });

  it('donut excludes the inner hole', () => {
    const mobs = [mob('inside', 2, 0), mob('ring', 6, 0), mob('outside', 12, 0)];
    const shape = { kind: 'donut', innerRadius: 4, outerRadius: 8 } as const;
    const hits = selectShapeTargets(castAt({ x: 0, z: 0 }), shape, shaped(shape), worldOf([caster, ...mobs]), caster);
    expect(hits.map((h) => h.id)).toEqual(['ring']);
  });

  it('cone selects only what is within the wedge toward the target', () => {
    const mobs = [mob('ahead', 5, 0), mob('beside', 0, 5)];
    const shape = { kind: 'cone', length: 10, halfAngleDeg: 30 } as const;
    // dir locked toward +X (the 'ahead' mob); 'beside' (+Z, 90° off) is outside a 30° half-angle.
    const cast = castAt({ x: 0, z: 0 }, { shapeDirRad: 0 });
    const hits = selectShapeTargets(cast, shape, shaped(shape), worldOf([caster, ...mobs]), caster);
    expect(hits.map((h) => h.id)).toEqual(['ahead']);
  });

  it('affects:allies flips the allegiance filter (a mob caster hits other mobs)', () => {
    const mobCaster = mob('mc', 0, 0);
    const others = [mob('ally', 3, 0), player('foe', 3, 1)];
    const shape = { kind: 'circle', radius: 5 } as const;
    const hits = selectShapeTargets(castAt({ x: 0, z: 0 }, { casterId: 'mc' }), shape, shaped(shape, 'allies'), worldOf([mobCaster, ...others]), mobCaster);
    expect(hits.map((h) => h.id)).toEqual(['ally']);
  });
});
