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
  it('new player picks human knight: only slash is unlocked (no fireball carryover)', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid(50);
    const player = joinNewPlayer('socketKnight', 'KnightTester');
    state.players[player.id] = player;
    spatial.insert(player.id, { x: player.position.x, z: player.position.z });
    const { sink } = captureOutbound();
    const socket = { id: 'socketKnight', emit: vi.fn() };

    // Human race gates allow knight; orc only allows warrior post-gate.
    handleClientMessage(socket, state, { type: 'SelectRace', race: 'human' }, sink, spatial);
    handleClientMessage(socket, state, { type: 'SelectClass', className: 'knight' }, sink, spatial);

    expect(player.race).toBe('human');
    expect(player.className).toBe('knight');
    expect(player.unlockedSkills).toEqual(['slash', 'basicAttack', 'escape']);
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

      handleClientMessage(socket, state, { type: 'SelectRace', race: 'human' }, sink, spatial);
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
  it('orc warrior → dwarf warrior keeps slash, base attrs shift with race', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid(50);
    const player = joinNewPlayer('socketRace', 'RaceTester');
    // Use level 5 so race multipliers give clearly different attrs.
    player.level = 5;
    state.players[player.id] = player;
    spatial.insert(player.id, { x: player.position.x, z: player.position.z });
    const { sink } = captureOutbound();
    const socket = { id: 'socketRace', emit: vi.fn() };

    // Pick a race+class pair both races allow (orc and dwarf both
    // grant warrior post-race-class-gate). Knight is human-only now.
    handleClientMessage(socket, state, { type: 'SelectRace', race: 'orc' }, sink, spatial);
    handleClientMessage(socket, state, { type: 'SelectClass', className: 'warrior' }, sink, spatial);
    const orcStr = player.stats?.str ?? 0;

    handleClientMessage(socket, state, { type: 'SelectRace', race: 'dwarf' }, sink, spatial);

    expect(player.className).toBe('warrior');
    expect(player.unlockedSkills).toEqual(['slash', 'basicAttack', 'escape']);
    // Race change → STR should differ. Orc has a higher STR multiplier
    // than dwarf, so orcStr should exceed dwarfStr.
    expect(player.stats?.str ?? 0).toBeLessThan(orcStr);
  });
});

describe('scenario: basic attack universal skill', () => {
  it('every fresh character can cast basicAttack on a goblin (no mana, no class restriction)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const state = createGameState();
      const spatial = new SpatialHashGrid(50);
      const player = joinNewPlayer('socketBA', 'BasicAttackTester');
      player.position = { x: 0, y: 0.5, z: 0 };
      state.players[player.id] = player;
      spatial.insert(player.id, { x: 0, z: 0 });
      const { sink } = captureOutbound();
      const socket = { id: 'socketBA', emit: vi.fn() };

      // Mage class — no melee skills, but basicAttack should still work.
      handleClientMessage(socket, state, { type: 'SelectClass', className: 'mage' }, sink, spatial);
      expect(player.unlockedSkills).toContain('basicAttack');

      const goblin = createEnemy('goblin', 1, { x: 2, y: 0.5, z: 0 }, NOW);
      state.enemies[goblin.id] = goblin;
      spatial.insert(goblin.id, { x: 2, z: 0 });
      const before = goblin.health;

      handleClientMessage(
        socket,
        state,
        { type: 'CastReq', id: player.id, skillId: 'basicAttack', targetId: goblin.id, clientTs: NOW },
        sink,
        spatial,
      );

      const world = createWorldCombatBridge(state, sink, spatial);
      vi.advanceTimersByTime(100);
      tickCasts(state.activeCasts, 100, sink, world);

      expect(goblin.health).toBeLessThan(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('scenario: PvP — players can attack other players', () => {
  it('player A casts basicAttack at player B → B takes damage', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const state = createGameState();
      const spatial = new SpatialHashGrid(50);

      const attacker = joinNewPlayer('socketA', 'Attacker');
      attacker.position = { x: 0, y: 0.5, z: 0 };
      state.players[attacker.id] = attacker;
      spatial.insert(attacker.id, { x: 0, z: 0 });

      const victim = joinNewPlayer('socketB', 'Victim');
      victim.position = { x: 2, y: 0.5, z: 0 };
      state.players[victim.id] = victim;
      spatial.insert(victim.id, { x: 2, z: 0 });
      const victimHealthBefore = victim.health;

      const { sink } = captureOutbound();
      const socket = { id: 'socketA', emit: vi.fn() };

      handleClientMessage(
        socket,
        state,
        { type: 'CastReq', id: attacker.id, skillId: 'basicAttack', targetId: victim.id, clientTs: NOW },
        sink,
        spatial,
      );

      const world = createWorldCombatBridge(state, sink, spatial);
      vi.advanceTimersByTime(100);
      tickCasts(state.activeCasts, 100, sink, world);

      expect(victim.health).toBeLessThan(victimHealthBefore);
    } finally {
      vi.useRealTimers();
    }
  });
});
