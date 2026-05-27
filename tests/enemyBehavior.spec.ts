import { describe, expect, test } from 'vitest';
import { applyEnemyAttack, findAggroTargetId, moveEnemyToward } from '../server/ai/enemyBehavior';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import type { PlayerState } from '../packages/sim/entities';

const makePlayer = (id: string, x: number, z: number): PlayerState => ({
  id,
  socketId: `${id}-socket`,
  name: id,
  position: { x, y: 0, z },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  className: 'mage',
  unlockedSkills: [],

  availableSkillPoints: 0,
  skillCooldownEndTs: {},
  statusEffects: [],
  level: 1,
  experience: 0,
  experienceToNextLevel: 100,
  castingSkill: null,
  castingProgressMs: 0,
  isAlive: true,
  maxInventorySlots: 20,
});

describe('enemy behavior helpers', () => {
  test('finds the first alive player inside aggro radius from spatial candidates', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 1);
    enemy.aggroRadius = 5;

    const dead = makePlayer('dead', 1, 0);
    dead.isAlive = false;
    const far = makePlayer('far', 20, 0);
    const near = makePlayer('near', 3, 4);

    expect(findAggroTargetId(enemy, { dead, far, near }, ['dead', 'far', 'near'], Date.now())).toBe('near');
  });

  test('sets velocity + facing toward a target and marks the enemy dirty', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 2);
    enemy.movementSpeed = 2;
    const spatial = new SpatialHashGrid(1);
    spatial.insert(enemy.id, enemy.position);

    // PR #324 — `moveEnemyToward` no longer integrates position; that
    // job belongs to `worldMovement.advanceEnemyPosition` in the
    // input/movement phase. The AI phase only sets velocity + facing.
    moveEnemyToward(enemy, { x: 10, z: 0 }, spatial, 1, Date.now());

    expect(enemy.position.x).toBe(0);
    expect(enemy.position.z).toBe(0);
    expect(enemy.velocity).toEqual({ x: 2, z: 0 });
    expect(enemy.rotation.y).toBeCloseTo(Math.PI / 2);
    expect((enemy as typeof enemy & { dirtySnap?: boolean }).dirtySnap).toBe(true);
  });

  test('applies enemy attacks with cooldowns and death state updates', () => {
    const enemy = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, 3);
    const player = makePlayer('target', 1, 0);
    enemy.attackDamage = 80;
    enemy.attackCooldownMs = 2_000;
    enemy.lastAttackTime = 5_000;

    expect(applyEnemyAttack(enemy, player, 6_000)).toBeNull();

    const firstAttack = applyEnemyAttack(enemy, player, 7_000);
    expect(firstAttack).toEqual({ damage: 80, killed: false, miss: false });
    expect(player.health).toBe(20);
    expect(enemy.lastAttackTime).toBe(7_000);

    const lethalAttack = applyEnemyAttack(enemy, player, 9_000);
    expect(lethalAttack).toEqual({ damage: 80, killed: true, miss: false });
    expect(player).toMatchObject({
      health: 0,
      isAlive: false,
      deathTimeTs: 9_000,
      targetId: null,
      castingSkill: null,
      castingProgressMs: 0,
    });
  });
});
