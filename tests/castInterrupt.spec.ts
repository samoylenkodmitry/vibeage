import { describe, expect, it } from 'vitest';
import { createTransientPlayer } from '../server/playerFactory';
import { tryInterruptForNewAction } from '../server/combat/castInterrupt';
import type { ActiveCastStore } from '../server/combat/skillSystem';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import { CastState as CastStateEnum } from '../packages/protocol/messages';

function captureOutbound(): { events: OutboundEvent[]; sink: OutboundEventSink } {
  const events: OutboundEvent[] = [];
  return { events, sink: { publish: (e) => events.push(e) } };
}

function makeCast(casterId: string, skillId: string) {
  return {
    castId: `c-${skillId}`,
    casterId,
    skillId: skillId as never,
    state: CastStateEnum.Casting,
    startedAt: Date.now(),
    castTimeMs: 30_000,
    origin: { x: 0, y: 0, z: 0 },
    progressMs: 0,
  };
}

describe('tryInterruptForNewAction', () => {
  it('allows the new action when no cast is active', () => {
    const player = createTransientPlayer('s1', 't1');
    player.castingSkill = null;
    const { sink } = captureOutbound();
    expect(tryInterruptForNewAction(player, {} as ActiveCastStore, sink, 'newCast')).toBe('allow');
  });

  it('interrupts an active blocking + interruptable cast (escape) and clears cooldown + refunds mana', () => {
    const player = createTransientPlayer('s2', 't2');
    player.castingSkill = 'escape';
    player.mana = 50;
    player.maxMana = 100;
    player.skillCooldownEndTs = { escape: Date.now() + 1_800_000 };
    const cast = makeCast(player.id, 'escape');
    const activeCasts: ActiveCastStore = { [cast.castId]: cast as never };
    const { sink, events } = captureOutbound();
    expect(tryInterruptForNewAction(player, activeCasts, sink, 'movement')).toBe('interrupted');
    expect(player.castingSkill).toBeNull();
    expect(activeCasts[cast.castId]).toBeUndefined();
    expect(player.skillCooldownEndTs.escape).toBeUndefined();
    expect(events.find((e) => e.type === 'playerUpdated')).toBeDefined();
  });
});
