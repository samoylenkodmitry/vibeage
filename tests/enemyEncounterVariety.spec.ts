import { describe, expect, it } from 'vitest';
import { advanceEnemyState } from '../server/ai/enemyStateMachine';
import { holdRangeFor, policyFor, selectMobSkillAtRange, strafeSign } from '../server/ai/enemyPolicy';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { ENEMY_AI_POLICIES, enemyAiArchetypeFor, enemySkillsWithArchetype } from '../packages/content/enemiesAi';
import { ENEMY_TEMPLATES } from '../packages/content/enemies';
import { SKILLS } from '../packages/content/skills';
import type { Enemy, PlayerState } from '../packages/sim/entities';

const NOW = 1_700_000_000_000;

function makePlayer(id: string, x: number, z: number): PlayerState {
  return {
    id,
    socketId: `${id}-s`,
    name: id,
    position: { x, y: 0, z },
    rotation: { x: 0, y: 0, z: 0 },
    health: 500,
    maxHealth: 500,
    mana: 100,
    maxMana: 100,
    className: 'knight',
    unlockedSkills: [],
    availableSkillPoints: 0,
    skillCooldownEndTs: {},
    statusEffects: [],
    level: 10,
    experience: 0,
    experienceToNextLevel: 100,
    castingSkill: null,
    castingProgressMs: 0,
    isAlive: true,
    maxInventorySlots: 20,
  };
}

/** Drives one AI tick with the enemy already locked on the player. */
function tickEngaged(enemy: Enemy, player: PlayerState, others: Enemy[] = []): void {
  const spatial = new SpatialHashGrid(1);
  spatial.insert(enemy.id, enemy.position);
  spatial.insert(player.id, player.position);
  const enemies: Record<string, Enemy> = { [enemy.id]: enemy };
  for (const other of others) {
    enemies[other.id] = other;
    spatial.insert(other.id, other.position);
  }
  enemy.targetId = player.id;
  advanceEnemyState(enemy, {
    players: { [player.id]: player },
    enemies,
    spatialGrid: spatial,
    deltaTime: 1 / 30,
    now: NOW,
  });
}

describe('encounter variety — archetype data', () => {
  it('resolves a policy for every shipped enemy template', () => {
    for (const template of Object.values(ENEMY_TEMPLATES)) {
      const policy = ENEMY_AI_POLICIES[enemyAiArchetypeFor(template)];
      expect(policy, template.type).toBeDefined();
      expect(policy.description.length).toBeGreaterThan(0);
    }
  });

  it('every archetype-granted ability is a real, described skill', () => {
    for (const policy of Object.values(ENEMY_AI_POLICIES)) {
      for (const id of policy.grantSkills) {
        expect(SKILLS[id], id).toBeDefined();
        expect(SKILLS[id].description.length, id).toBeGreaterThan(0);
      }
    }
  });

  it('prepends archetype grants ahead of the template list, without duplicates', () => {
    const troll = ENEMY_TEMPLATES.troll;
    const skills = enemySkillsWithArchetype(troll);
    expect(skills[0]).toBe('mobCleave');
    expect(skills).toContain('mobStrike');
    expect(new Set(skills).size).toBe(skills.length);
  });

  it('gives the brute a telegraphed ability the player can read and dodge', () => {
    const cleave = SKILLS[ENEMY_AI_POLICIES.brute.grantSkills[0]];
    expect(cleave.telegraph?.windUpMs).toBeGreaterThan(0);
    expect(cleave.shape?.kind).toBe('cone');
  });
});

describe('encounter variety — engagement range', () => {
  it('a caster holds spell range while its bolt is up and closes when it is not', () => {
    const caster = createEnemy('fire_elemental', 10, { x: 0, y: 0, z: 0 }, NOW);
    expect(holdRangeFor(caster, NOW)).toBeGreaterThan(caster.attackRange * 2);
    caster.skillCooldownEndTs = { mobFirebolt: NOW + 4_000 };
    expect(holdRangeFor(caster, NOW)).toBe(caster.attackRange);
  });

  it('a melee-only mob still fights at its bite range (early game untouched)', () => {
    const goblin = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    expect(policyFor(goblin).id).toBe('brawler');
    expect(holdRangeFor(goblin, NOW)).toBe(goblin.attackRange);
  });

  it('skips abilities that cannot reach the target instead of swinging at air', () => {
    const caster = createEnemy('fire_elemental', 10, { x: 0, y: 0, z: 0 }, NOW);
    expect(selectMobSkillAtRange(caster, NOW, 12)).toBe('mobFirebolt');
    // Bolt on cooldown at 12m: the 2m strike can't reach, so nothing fires.
    caster.skillCooldownEndTs = { mobFirebolt: NOW + 4_000 };
    expect(selectMobSkillAtRange(caster, NOW, 12)).toBeNull();
    expect(selectMobSkillAtRange(caster, NOW, 1.5)).toBe('mobStrike');
  });
});

describe('encounter variety — behaviour', () => {
  it('a caster gives ground when a player closes on it', () => {
    const caster = createEnemy('fire_elemental', 10, { x: 0, y: 0, z: 0 }, NOW);
    caster.aiState = 'attacking';
    const player = makePlayer('p1', 1.5, 0);
    tickEngaged(caster, player);
    // Velocity points away from the player, i.e. down -X.
    expect(caster.velocity?.x).toBeLessThan(0);
  });

  it('a brawler plants its feet instead of repositioning', () => {
    const goblin = createEnemy('goblin', 1, { x: 0, y: 0, z: 0 }, NOW);
    goblin.aiState = 'attacking';
    const player = makePlayer('p1', 1.5, 0);
    tickEngaged(goblin, player);
    expect(goblin.velocity).toEqual({ x: 0, z: 0 });
  });

  it('a lone pack hunter commits rather than waiting for a pack that is not there', () => {
    const wolf = createEnemy('wolf', 5, { x: 0, y: 0, z: 0 }, NOW);
    wolf.packId = 'pack-a';
    wolf.aiState = 'chasing';
    wolf.chaseStartedAt = NOW;
    const player = makePlayer('p1', 1.5, 0);
    tickEngaged(wolf, player);
    expect(wolf.aiState).toBe('attacking');
  });

  it('a pack hunter circles while a packmate has not joined yet', () => {
    const wolf = createEnemy('wolf', 5, { x: 0, y: 0, z: 0 }, NOW);
    const mate = createEnemy('wolf', 5, { x: 4, y: 0, z: 4 }, NOW + 1);
    wolf.packId = 'pack-a';
    mate.packId = 'pack-a';
    mate.aiState = 'idle';
    wolf.aiState = 'chasing';
    wolf.chaseStartedAt = NOW;
    const player = makePlayer('p1', 1.5, 0);
    tickEngaged(wolf, player, [mate]);
    expect(wolf.aiState).toBe('chasing');
    expect(wolf.velocity?.z).not.toBe(0);
  });

  it('a support mob does not burn its mend when nobody is hurt', () => {
    const mender = createEnemy('necromancer', 10, { x: 0, y: 0, z: 0 }, NOW);
    expect(mender.skills?.[0]).toBe('mobMendPack');
    const healthyMate = createEnemy('necromancer', 10, { x: 3, y: 0, z: 0 }, NOW + 1);
    const alwaysHealthy = () => false;
    expect(selectMobSkillAtRange(mender, NOW, 1.5, alwaysHealthy)).not.toBe('mobMendPack');
    healthyMate.health = healthyMate.maxHealth * 0.4;
    expect(selectMobSkillAtRange(mender, NOW, 1.5, () => true)).toBe('mobMendPack');
  });

  it('a wounded support mob breaks off once and calls the pack in', () => {
    const mender = createEnemy('necromancer', 10, { x: 0, y: 0, z: 0 }, NOW);
    mender.packId = 'pack-b';
    // Dragged well away from spawn, as a mob that chased a player would be.
    mender.position = { x: 40, y: 0, z: 0 };
    mender.aiState = 'attacking';
    mender.health = mender.maxHealth * 0.1;
    const player = makePlayer('p1', 41.5, 0);
    tickEngaged(mender, player);
    expect(mender.aiState).toBe('returning');
    expect(mender.hasRegrouped).toBe(true);
    expect(mender.aggroSuppressedUntilTs).toBeGreaterThan(NOW);
    // Second pass at low HP must not loop: it has already spent its retreat.
    mender.aiState = 'attacking';
    tickEngaged(mender, player);
    expect(mender.aiState).toBe('attacking');
  });

  it('strafe direction is deterministic — the same mob replays identically', () => {
    const spider = createEnemy('spider', 5, { x: 0, y: 0, z: 0 }, NOW);
    expect(strafeSign(spider, NOW)).toBe(strafeSign(spider, NOW));
    expect([-1, 1]).toContain(strafeSign(spider, NOW));
  });
});
