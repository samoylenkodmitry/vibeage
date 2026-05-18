import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameState } from '../server/gameState';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import { handleClientMessage } from '../server/world/clientMessageRouter';
import { createTransientPlayer } from '../server/playerFactory';
import { applyClassChange, applyRaceChange } from '../server/players/playerIdentity';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import { vi } from 'vitest';

function captureOutbound(): { events: OutboundEvent[]; sink: OutboundEventSink } {
  const events: OutboundEvent[] = [];
  return { events, sink: { publish: (e) => events.push(e) } };
}

describe('class change clears stale specializationId', () => {
  it('switching class drops the old (now mismatched) spec', () => {
    const player = createTransientPlayer('s1', 'tester');
    player.race = 'orc'; // allows warrior
    player.className = 'warrior';
    player.specializationId = 'berserker'; // warrior spec — would be invalid for mage
    const { sink } = captureOutbound();
    // Allow re-pick by hopping race to one that allows the target class.
    player.race = 'human';
    applyClassChange(player, 'mage', sink);
    expect(player.className).toBe('mage');
    expect(player.specializationId).toBeNull();
  });

  it('changing race that snaps class also drops the stale spec', () => {
    const player = createTransientPlayer('s2', 'tester2');
    player.race = 'orc';
    player.className = 'warrior';
    player.specializationId = 'berserker';
    const { sink } = captureOutbound();
    applyRaceChange(player, 'human', sink);
    // Human doesn't allow warrior → snap; spec cleared.
    expect(player.className).not.toBe('warrior');
    expect(player.specializationId).toBeNull();
  });
});

describe('SelectRace / SelectClass are GM-gated in-world', () => {
  beforeAll(() => { delete process.env.VIBEAGE_ENABLE_DEV_COMMANDS; });
  afterAll(() => { delete process.env.VIBEAGE_ENABLE_DEV_COMMANDS; });

  it('SelectRace is rejected when GM mode is off', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid(50);
    const player = createTransientPlayer('s3', 'tester3');
    state.players[player.id] = player;
    spatial.insert(player.id, { x: 0, z: 0 });
    const { sink } = captureOutbound();
    const socket = { id: 's3', emit: vi.fn() };
    const initialRace = player.race;
    handleClientMessage(socket, state, { type: 'SelectRace', race: 'orc' }, sink, spatial);
    expect(player.race).toBe(initialRace);
  });

  it('SelectClass is rejected when GM mode is off', () => {
    const state = createGameState();
    const spatial = new SpatialHashGrid(50);
    const player = createTransientPlayer('s4', 'tester4');
    state.players[player.id] = player;
    spatial.insert(player.id, { x: 0, z: 0 });
    const { sink } = captureOutbound();
    const socket = { id: 's4', emit: vi.fn() };
    const initialClass = player.className;
    handleClientMessage(socket, state, { type: 'SelectClass', className: 'knight' }, sink, spatial);
    expect(player.className).toBe(initialClass);
  });
});
