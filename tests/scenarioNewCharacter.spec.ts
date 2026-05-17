import { describe, expect, it, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createTransientPlayer } from '../server/playerFactory';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { handleClientMessage } from '../server/world/clientMessageRouter';
import { tickCasts } from '../server/combat/skillSystem';
import { createWorldCombatBridge } from '../server/world/clientMessageRouter';
import { forgetSocketRateLimits } from '../server/world/rateLimiter';
import { forgetMovementFreshness } from '../server/movement/staleIntentTracker';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';

const NOW = 1_700_000_000_000;

function captureOutbound(): { events: OutboundEvent[]; sink: OutboundEventSink } {
  const events: OutboundEvent[] = [];
  return { events, sink: { publish: (e) => events.push(e) } };
}

function joinNewPlayer(socketId: string, name: string) {
  forgetSocketRateLimits(socketId);
  forgetMovementFreshness(socketId);
  return createTransientPlayer(socketId, name);
}

/**
 * Full create-a-character-and-cast scenarios. These exercise the same
 * codepaths the real client hits (SelectRace → SelectClass → CastReq)
 * so regressions like "new knight has fireball" or "slash doesn't cast"
 * can't slip past unit-level tests anymore.
 */
describe('scenario: wire-boundary accepts non-mage CastReq', () => {
  it('safeParseClientMessage accepts CastReq for every class starter skill', async () => {
    const { safeParseClientMessage } = await import('../packages/protocol/messages');
    const STARTER_SKILLS = ['slash', 'holyLight', 'arrowShot', 'evade', 'fireball'];
    for (const skillId of STARTER_SKILLS) {
      const result = safeParseClientMessage({
        type: 'CastReq',
        id: 'player1',
        skillId,
        targetId: 'enemy1',
        clientTs: NOW,
      });
      expect(result.success, `CastReq(${skillId}) must parse — found prod bug where this was rejected at the wire`).toBe(true);
    }
  });
});

describe('scenario: new orc knight can cast slash on a goblin', () => {
  it('new player picks orc knight: only slash is unlocked (no fireball carryover)', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid(50);
    const player = joinNewPlayer('socketKnight', 'KnightTester');
    state.players[player.id] = player;
    spatial.insert(player.id, { x: player.position.x, z: player.position.z });
    const { sink } = captureOutbound();
    const socket = { id: 'socketKnight', emit: vi.fn() };

    handleClientMessage(socket, state, { type: 'SelectRace', race: 'orc' }, sink, spatial);
    handleClientMessage(socket, state, { type: 'SelectClass', className: 'knight' }, sink, spatial);

    expect(player.race).toBe('orc');
    expect(player.className).toBe('knight');
    expect(player.unlockedSkills).toEqual(['slash']);
    expect(player.unlockedSkills).not.toContain('fireball');
    expect(player.skillShortcuts).toContain('slash');
  });

  it('slash on a goblin in range deals damage end-to-end (resolves through tickCasts)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const state = createGameState();
      const spatial = new SpatialHashGrid(50);
      const player = joinNewPlayer('socketKnight2', 'KnightTester2');
      player.position = { x: 0, y: 0.5, z: 0 };
      state.players[player.id] = player;
      spatial.insert(player.id, { x: 0, z: 0 });
      const { events: outboundEvents, sink } = captureOutbound();
      const socket = { id: 'socketKnight2', emit: vi.fn() };

      handleClientMessage(socket, state, { type: 'SelectRace', race: 'orc' }, sink, spatial);
      handleClientMessage(socket, state, { type: 'SelectClass', className: 'knight' }, sink, spatial);

      // Spawn a goblin 2 units away (slash range is 4).
      const goblin = createEnemy('goblin', 1, { x: 2, y: 0.5, z: 0 }, NOW);
      state.enemies[goblin.id] = goblin;
      spatial.insert(goblin.id, { x: 2, z: 0 });
      const goblinHealthBefore = goblin.health;

      // Cast slash with the goblin as target.
      handleClientMessage(
        socket,
        state,
        { type: 'CastReq', id: player.id, skillId: 'slash', targetId: goblin.id, clientTs: NOW },
        sink,
        spatial,
      );

      // Slash has castMs=200. Tick the cast pipeline until the cast
      // resolves (advance fake clock so now-startedAt >= castTimeMs).
      const world = createWorldCombatBridge(state, sink, spatial);
      vi.advanceTimersByTime(300);
      tickCasts(state.activeCasts, 100, sink, world);

      expect(goblin.health).toBeLessThan(goblinHealthBefore);
      const combatLogs = outboundEvents.filter(
        (e) => e.type === 'serverMessage' && e.message.type === 'CombatLog',
      );
      expect(combatLogs.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('scenario: race switch swaps base attrs without losing class', () => {
  it('orc knight → dwarf knight keeps slash, base attrs shift with race', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid(50);
    const player = joinNewPlayer('socketRace', 'RaceTester');
    // Use level 5 so race multipliers give clearly different attrs.
    player.level = 5;
    state.players[player.id] = player;
    spatial.insert(player.id, { x: player.position.x, z: player.position.z });
    const { sink } = captureOutbound();
    const socket = { id: 'socketRace', emit: vi.fn() };

    handleClientMessage(socket, state, { type: 'SelectClass', className: 'knight' }, sink, spatial);
    handleClientMessage(socket, state, { type: 'SelectRace', race: 'orc' }, sink, spatial);
    const orcStr = player.stats?.str ?? 0;

    handleClientMessage(socket, state, { type: 'SelectRace', race: 'dark_elf' }, sink, spatial);

    expect(player.className).toBe('knight');
    expect(player.unlockedSkills).toEqual(['slash']);
    // Race change → STR should differ. Orc has a higher STR multiplier
    // than dark_elf, so orcStr should exceed darkElfStr.
    expect(player.stats?.str ?? 0).toBeLessThan(orcStr);
  });
});
