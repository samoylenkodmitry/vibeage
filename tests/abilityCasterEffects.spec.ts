import { describe, expect, it } from 'vitest';
import { applyCasterEffects } from '../server/combat/abilityShapes';
import type { Cast } from '../server/combat/skillSystem';
import type { SkillDef } from '../packages/content/skills';
import type { CombatWorld } from '../server/combat/worldContract';
import type { Enemy, PlayerState } from '../packages/sim/entities';

const mob = (id: string, x: number, z: number): Enemy =>
  ({ id, type: 'goblin', isAlive: true, level: 5, position: { x, y: 0.5, z } } as unknown as Enemy);
const player = (id: string, x: number, z: number): PlayerState =>
  ({ id, isAlive: true, level: 5, position: { x, y: 0.5, z } } as unknown as PlayerState);

const cast = (casterId: string, targetId: string): Cast =>
  ({ casterId, targetId, skillId: 'x', origin: { x: 0, z: 0 } } as unknown as Cast);

describe('applyCasterEffects — blink + summon', () => {
  it('blink teleports the caster to the far side of its target', () => {
    const caster = mob('boss', 0, 0);
    const target = player('p', 5, 0);
    const world = { getEnemyById: () => null, getPlayerById: (id: string) => (id === 'p' ? target : null) } as unknown as CombatWorld;
    applyCasterEffects(caster, cast('boss', 'p'), { blink: { offset: 2 } } as unknown as SkillDef, world, 0);
    // Far side of the target along the boss→target axis (+X): 5 + 2 = 7.
    expect(caster.position.x).toBeCloseTo(7, 5);
    expect(caster.position.z).toBeCloseTo(0, 5);
  });

  it('summon spawns `count` minions of the given type via world.spawnMinion', () => {
    const caster = mob('summoner', 0, 0);
    const spawned: Array<{ type: string; level: number }> = [];
    const world = {
      getEnemyById: () => null, getPlayerById: () => null,
      spawnMinion: (type: string, level: number) => spawned.push({ type, level }),
    } as unknown as CombatWorld;
    applyCasterEffects(caster, cast('summoner', ''), { summon: { type: 'wolf', count: 3, radius: 4 } } as unknown as SkillDef, world, 0);
    expect(spawned).toHaveLength(3);
    expect(spawned.every((s) => s.type === 'wolf' && s.level === 5)).toBe(true);
  });

  it('is a no-op when the skill has neither blink nor summon', () => {
    const caster = mob('m', 1, 1);
    const world = { getEnemyById: () => null, getPlayerById: () => null } as unknown as CombatWorld;
    applyCasterEffects(caster, cast('m', ''), { effects: [] } as unknown as SkillDef, world, 0);
    expect(caster.position).toEqual({ x: 1, y: 0.5, z: 1 });
  });
});
