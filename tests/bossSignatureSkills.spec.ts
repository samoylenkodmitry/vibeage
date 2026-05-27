import { describe, expect, it } from 'vitest';
import { createGameState } from '../server/gameState';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { castMobSkill, tickCasts } from '../server/combat/skillSystem';
import { createWorldCombatBridge } from '../server/world/router/castHandlers';
import { MINI_BOSSES } from '../packages/content/miniBosses';
import { bossSignatureSkillId } from '../packages/content/bossSkills';
import { SKILLS } from '../packages/content/skills';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { Enemy, PlayerState } from '../packages/sim/entities';

const NOW = 1_700_000_000_000;
const player = (id: string, x: number, z = 0): PlayerState => ({
  id, socketId: id, name: id, position: { x, y: 0.5, z }, rotation: { x: 0, y: 0, z: 0 },
  health: 1000, maxHealth: 1000, mana: 100, maxMana: 100, className: 'mage', unlockedSkills: [],
  availableSkillPoints: 0, skillCooldownEndTs: {}, statusEffects: [], level: 5, experience: 0,
  experienceToNextLevel: 100, castingSkill: null, castingProgressMs: 0, isAlive: true, maxInventorySlots: 20,
} as unknown as PlayerState);

/**
 * A3 (docs/ABILITY_SYSTEM.md) — boss signatures are ordinary skills now.
 * The per-kind geometry is covered generically by abilityShapes /
 * abilityTelegraph / abilityCasterEffects / customSkillBehaviors; this
 * pins that each boss OWNS its signature skill and that it resolves
 * end-to-end through the shared cast pipeline (no boss-specific code).
 */
describe('boss signature skills', () => {
  function bossWorld(bossId: string, players: PlayerState[]) {
    const state = createGameState();
    const spatial = new SpatialHashGrid();
    const boss = createEnemy(MINI_BOSSES[bossId].mobType, 10, { x: 0, y: 0.5, z: 0 }, NOW, { isMiniBoss: true, bossId });
    boss.stats = { ...boss.stats, attackPower: 100 };
    state.enemies[boss.id] = boss;
    spatial.insert(boss.id, { x: 0, z: 0 });
    for (const p of players) { state.players[p.id] = p; spatial.insert(p.id, { x: p.position.x, z: p.position.z }); }
    const events: OutboundEvent[] = [];
    const outbound: OutboundEventSink = { publish: (e) => events.push(e) };
    const world = createWorldCombatBridge(state, outbound, spatial);
    const fire = (target: PlayerState, windUpMs: number) => {
      castMobSkill(boss, target, bossSignatureSkillId(bossId), NOW, { world, activeCasts: state.activeCasts, outbound });
      tickCasts(state.activeCasts, 50, outbound, world, NOW + windUpMs + 1);
    };
    return { state, boss, events, world, fire };
  }

  it('every mini-boss spawns leading with its signature skill, then a basic strike', () => {
    for (const id of Object.keys(MINI_BOSSES)) {
      const boss = createEnemy(MINI_BOSSES[id].mobType, 10, { x: 0, y: 0.5, z: 0 }, NOW, { isMiniBoss: true, bossId: id });
      expect(boss.skills?.[0], `${id} leads with its signature`).toBe(bossSignatureSkillId(id));
      expect(boss.skills, `${id} keeps a basic strike fallback`).toContain('mobStrike');
      expect(SKILLS[boss.skills![0]], `${id} signature is registered`).toBeTruthy();
    }
  });

  it('cone (Vorthax) sweeps players in front, spares those behind', () => {
    const front = player('front', 6);
    const back = player('back', -6);
    const { fire } = bossWorld('vorthax_ember_wyrm', [front, back]);
    fire(front, 2500);
    expect(front.health).toBeLessThan(1000);
    expect(back.health).toBe(1000);
  });

  it('circle (Greyfang) lands on the target ground — hits near the target, not near the boss', () => {
    const target = player('target', 12);
    const nearTarget = player('nearT', 13);
    const nearBoss = player('nearB', 1);
    const { fire } = bossWorld('old_greyfang', [target, nearTarget, nearBoss]);
    fire(target, 1200);
    expect(target.health, 'locked target hit').toBeLessThan(1000);
    expect(nearTarget.health, 'bystander by the target hit').toBeLessThan(1000);
    expect(nearBoss.health, 'player next to the boss is safe (anchor: target)').toBe(1000);
  });

  it('blink (Mistwalker) reappears behind the locked target and damages it', () => {
    const target = player('target', 10);
    const { boss, fire } = bossWorld('mistwalker', [target]);
    fire(target, 1400);
    expect(target.health).toBeLessThan(1000);
    expect(boss.position.x, 'boss teleported to the far side of the target').toBeGreaterThan(10);
  });

  it('the signature hits harder than a basic strike (damageMult)', () => {
    const a = player('a', 4);
    const sig = bossWorld('vorthax_ember_wyrm', [a]);
    sig.fire(a, 2500);
    const sigDmg = 1000 - a.health;

    const b = player('b', 1);
    const plain = bossWorld('vorthax_ember_wyrm', [b]);
    castMobStrike(plain.boss, b, plain.world);
    const strikeDmg = 1000 - b.health;
    expect(sigDmg).toBeGreaterThan(strikeDmg);
  });
});

function castMobStrike(boss: Enemy, target: PlayerState, world: ReturnType<typeof createWorldCombatBridge>) {
  const state = createGameState();
  const outbound: OutboundEventSink = { publish: () => undefined };
  castMobSkill(boss, target, 'mobStrike', NOW, { world, activeCasts: state.activeCasts, outbound });
  tickCasts(state.activeCasts, 50, outbound, world, NOW + 1);
}
