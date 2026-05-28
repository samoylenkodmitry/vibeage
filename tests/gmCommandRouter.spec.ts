import { afterEach, describe, expect, it } from 'vitest';
import { createGameState } from '../server/gameState';
import { createTransientPlayer } from '../server/playerFactory';
import { onGmCommand } from '../server/world/router/devHandlers';
import type { ServerMessage } from '../packages/protocol/messages';
import type { DirectMessageSink, OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';

function sinks(): {
  directMessages: ServerMessage[];
  outboundEvents: OutboundEvent[];
  direct: DirectMessageSink;
  outbound: OutboundEventSink;
} {
  const directMessages: ServerMessage[] = [];
  const outboundEvents: OutboundEvent[] = [];
  return {
    directMessages,
    outboundEvents,
    direct: { send: (message) => directMessages.push(message) },
    outbound: { publish: (event) => outboundEvents.push(event) },
  };
}

describe('onGmCommand', () => {
  afterEach(() => {
    delete process.env.VIBEAGE_ENABLE_DEV_COMMANDS;
    delete process.env.VIBEAGE_GM_ACCOUNTS;
  });

  it('emits notGm when the caller is not allowed to use GM tools', () => {
    const state = createGameState();
    const caller = createTransientPlayer('socket-gm', 'Regular');
    state.players[caller.id] = caller;
    const { directMessages, direct, outbound } = sinks();

    onGmCommand(
      { id: 'socket-gm', emit: () => undefined },
      direct,
      state,
      { type: 'GmCommand', verb: 'grantXp', value: 10, clientSeq: 7 },
      outbound,
    );

    expect(directMessages).toContainEqual({
      type: 'CommandRejected',
      commandType: 'GmCommand',
      reason: 'notGm',
      requestId: 7,
    });
  });

  it('emits invalid when the GM verb payload is rejected by the dispatcher', () => {
    process.env.VIBEAGE_ENABLE_DEV_COMMANDS = '1';
    const state = createGameState();
    const caller = createTransientPlayer('socket-gm', 'Gm');
    state.players[caller.id] = caller;
    const { directMessages, direct, outbound } = sinks();

    onGmCommand(
      { id: 'socket-gm', emit: () => undefined },
      direct,
      state,
      { type: 'GmCommand', verb: 'grantSkill', value: 'not-a-skill', clientSeq: 8 },
      outbound,
    );

    expect(directMessages).toContainEqual({
      type: 'CommandRejected',
      commandType: 'GmCommand',
      reason: 'invalid',
      requestId: 8,
    });
  });

  it('emits playerNotFound when the selected player target is gone', () => {
    process.env.VIBEAGE_ENABLE_DEV_COMMANDS = '1';
    const state = createGameState();
    const caller = createTransientPlayer('socket-gm', 'Gm');
    state.players[caller.id] = caller;
    const { directMessages, direct, outbound } = sinks();

    onGmCommand(
      { id: 'socket-gm', emit: () => undefined },
      direct,
      state,
      { type: 'GmCommand', verb: 'grantXp', value: 10, targetId: 'missing-player', clientSeq: 9 },
      outbound,
    );

    expect(directMessages).toContainEqual({
      type: 'CommandRejected',
      commandType: 'GmCommand',
      reason: 'playerNotFound',
      requestId: 9,
    });
  });
});
