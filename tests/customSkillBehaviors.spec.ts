import { describe, expect, it } from 'vitest';
import { SKILLS } from '../packages/content/skills';
import { CUSTOM_SKILL_BEHAVIORS } from '../server/combat/customSkillBehaviors';
import { createGameState } from '../server/gameState';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { castMobSkill, tickCasts } from '../server/combat/skillSystem';
import { createWorldCombatBridge } from '../server/world/router/castHandlers';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

const NOW = 1_700_000_000_000;
const player = (id: string, x: number): PlayerState =>
  ({ id, socketId: id, name: id, position: { x, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 1000, maxHealth: 1000, mana: 100, maxMana: 100, className: 'mage', unlockedSkills: [],
    availableSkillPoints: 0, skillCooldownEndTs: {}, statusEffects: [], level: 5, experience: 0,
    experienceToNextLevel: 100, castingSkill: null, castingProgressMs: 0, isAlive: true, maxInventorySlots: 20,
  } as unknown as PlayerState);

/** A2 (docs/ABILITY_SYSTEM.md §2b) — the custom-behavior escape hatch. */
describe('custom skill behaviors', () => {
  it('every customBehavior id referenced by a skill resolves in the registry', () => {
    for (const [id, skill] of Object.entries(SKILLS)) {
      if (skill.customBehavior) {
        expect(CUSTOM_SKILL_BEHAVIORS[skill.customBehavior], `${id} → unknown behavior ${skill.customBehavior}`).toBeTypeOf('function');
      }
    }
  });

  it('every custom-behavior skill is described (so the wiki can render it)', () => {
    for (const [id, skill] of Object.entries(SKILLS)) {
      if (skill.customBehavior) {
        expect(skill.description.length, `${id} needs a description`).toBeGreaterThan(0);
      }
    }
  });

  it('warbandHowl rallies packmates onto the caster target through the cast pipeline', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const boss = createEnemy('orc', 5, { x: 0, y: 0.5, z: 0 }, NOW); boss.packId = 'warband';
    const mate = createEnemy('orc', 5, { x: 3, y: 0.5, z: 0 }, NOW + 1); mate.packId = 'warband'; mate.aiState = 'idle';
    const target = player('victim', 2);
    for (const e of [boss, mate]) { state.enemies[e.id] = e; spatial.insert(e.id, { x: e.position.x, z: e.position.z }); }
    state.players[target.id] = target; spatial.insert(target.id, { x: 2, z: 0 });
    boss.targetId = target.id;

    const events: OutboundEvent[] = [];
    const outbound: OutboundEventSink = { publish: (e) => events.push(e) };
    const world = createWorldCombatBridge(state, outbound, spatial);
    castMobSkill(boss, target, 'mobWarbandHowl', NOW, { world, activeCasts: state.activeCasts, outbound });
    tickCasts(state.activeCasts, 100, outbound, world, NOW);

    expect(mate.targetId).toBe(target.id);
    expect(mate.aiState).toBe('chasing');
  });
});
