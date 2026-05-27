import { describe, expect, it } from 'vitest';
import { createGameState } from '../server/gameState';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { SimClock } from '../packages/sim/simClock';
import { updateEnemyAI } from '../server/ai/enemyAI';
import { tickCasts } from '../server/combat/skillSystem';
import { createWorldCombatBridge } from '../server/world/router/castHandlers';
import { handleResourceRegeneration } from '../server/players/playerLifecycle';
import { makeSimPlayer, makeSimMiniBoss, timeToKill, mainAttackFor } from '../server/sim/combatBalance';
import type { PlayerState, Enemy } from '../packages/sim/entities';

/**
 * A5 (docs/ABILITY_SYSTEM.md) — the simulator must drive the new
 * telegraphed / AOE boss signatures through the real cast pipeline, and
 * encounters must stay sane (the signature lands; the boss is killable).
 */
const TICK_MS = 100;
const TIMEOUT_MS = 60_000;

function runEncounter(player: PlayerState, boss: Enemy) {
  const state = createGameState();
  const spatial = new SpatialHashGrid();
  player.position = { x: 0, y: 0.5, z: 0 };
  boss.position = { x: 1.5, y: 0.5, z: 0 }; // engage range — match timeToDie's arena
  boss.spawnPosition = { x: 1.5, y: 0.5, z: 0 };
  state.players[player.id] = player;
  state.enemies[boss.id] = boss;
  spatial.insert(player.id, { x: 0, z: 0 });
  spatial.insert(boss.id, { x: 1.5, z: 0 });
  const events: Array<{ type: string; message?: { type: string } }> = [];
  const outbound = { publish: (e: { type: string; message?: { type: string } }) => events.push(e) };
  const world = createWorldCombatBridge(state, outbound, spatial);
  const clock = new SimClock();
  while (player.isAlive && player.health > 0 && clock.now() < TIMEOUT_MS) {
    clock.advanceBy(TICK_MS);
    updateEnemyAI(boss, TICK_MS / 1000, { state, outbound, spatial, now: clock.now(), world, activeCasts: state.activeCasts });
    tickCasts(state.activeCasts, TICK_MS, outbound, world, clock.now());
    handleResourceRegeneration(state, outbound, clock.now());
  }
  const telegraphs = events.filter((e) => e.type === 'serverMessage' && e.message?.type === 'BossTelegraph').length;
  return { telegraphs, playerHp: player.health, died: player.health <= 0 };
}

describe('boss encounters drive the telegraphed signature in-sim', () => {
  it.each([
    ['vorthax_ember_wyrm', 'cone'],
    ['old_greyfang', 'circle'],
  ])('%s (%s) telegraphs its signature and damages the player', (bossId) => {
    const r = runEncounter(makeSimPlayer('mage', 20), makeSimMiniBoss(bossId, 20));
    expect(r.telegraphs, 'shaped signature emits a ground telegraph').toBeGreaterThan(0);
    expect(r.playerHp, 'the boss deals damage to the player').toBeLessThan(makeSimPlayer('mage', 20).maxHealth);
  });

  it('blink boss (Mistwalker) damages the player through its signature', () => {
    const r = runEncounter(makeSimPlayer('knight', 20), makeSimMiniBoss('mistwalker', 20));
    expect(r.playerHp).toBeLessThan(makeSimPlayer('knight', 20).maxHealth);
  });

  it('a boss is killable — the player damages it through the cast pipeline', () => {
    const boss = makeSimMiniBoss('old_greyfang', 20);
    const startHp = boss.health;
    const k = timeToKill(makeSimPlayer('mage', 20), boss, mainAttackFor('mage'), 60_000);
    expect(k.hits, 'player casts land on the boss').toBeGreaterThan(0);
    expect(boss.health, 'boss loses health').toBeLessThan(startHp);
  });
});
