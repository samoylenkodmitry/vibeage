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
    expect(caster.velocity).toEqual({ x: 0, z: 0 });
    expect(caster.dirtySnap).toBe(true);
  });

  it('blink snaps a player caster and cancels stale movement', () => {
    const caster = player('rogue', 0, 0);
    caster.velocity = { x: 5, z: 0 };
    caster.movement = { isMoving: true, targetPos: { x: 20, z: 0 }, lastUpdateTime: 0, speed: 5 };
    const target = mob('target', 4, 0);
    const world = { getEnemyById: (id: string) => (id === 'target' ? target : null), getPlayerById: () => null } as unknown as CombatWorld;

    applyCasterEffects(caster, cast('rogue', 'target'), { blink: { offset: 1.5 } } as unknown as SkillDef, world, 0);

    expect(caster.position.x).toBeCloseTo(5.5, 5);
    expect(caster.position.z).toBeCloseTo(0, 5);
    expect(caster.velocity).toEqual({ x: 0, z: 0 });
    expect(caster.movement).toBeUndefined();
    expect(caster.dirtySnap).toBe(true);
  });

  it('summon spawns `count` minions of the given type via world.spawnMinion', () => {
    const caster = mob('summoner', 0, 0);
    const spawned: Array<{ type: string; level: number; options?: unknown }> = [];
    const world = {
      getEnemyById: () => null, getPlayerById: () => null,
      spawnMinion: (type: string, level: number, _pos: unknown, _now: number, options?: unknown) => spawned.push({ type, level, options }),
    } as unknown as CombatWorld;
    applyCasterEffects(caster, cast('summoner', ''), {
      summon: {
        type: 'wolf',
        count: 3,
        radius: 4,
        namePrefix: 'Mirror',
        healthMultiplier: 0.35,
        damageMultiplier: 0.35,
        experienceMultiplier: 0,
        lootTableIdOverride: '',
      },
    } as unknown as SkillDef, world, 0);
    expect(spawned).toHaveLength(3);
    expect(spawned.every((s) => s.type === 'wolf' && s.level === 5)).toBe(true);
    expect(spawned[0].options).toEqual({
      namePrefix: 'Mirror',
      healthMultiplier: 0.35,
      damageMultiplier: 0.35,
      experienceMultiplier: 0,
      lootTableIdOverride: '',
    });
  });

  it('is a no-op when the skill has neither blink nor summon', () => {
    const caster = mob('m', 1, 1);
    const world = { getEnemyById: () => null, getPlayerById: () => null } as unknown as CombatWorld;
    applyCasterEffects(caster, cast('m', ''), { effects: [] } as unknown as SkillDef, world, 0);
    expect(caster.position).toEqual({ x: 1, y: 0.5, z: 1 });
  });
});
