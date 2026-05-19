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

  it('interrupts an active blocking + interruptable cast (fireball) and clears cooldown + refunds mana', () => {
    // PR WW — Escape is now isInterruptable:false ("locked recall
    // channel"), so it no longer fits the "interruptable" path. Use
    // a vanilla blocking + interruptable skill (fireball) for this
    // test; the "Escape stays put on movement" path is locked in
    // by tests/escapeTeleport.spec.ts.
    const player = createTransientPlayer('s2', 't2');
    player.castingSkill = 'fireball';
    player.mana = 50;
    player.maxMana = 100;
    player.skillCooldownEndTs = { fireball: Date.now() + 500 };
    const cast = makeCast(player.id, 'fireball');
    const activeCasts: ActiveCastStore = { [cast.castId]: cast as never };
    const { sink, events } = captureOutbound();
    // Force the resist to miss (stat exists on transient player, so we
    // pass an rng that always rolls 1.0 — never under any chance).
    expect(tryInterruptForNewAction(player, activeCasts, sink, 'movement', () => 1)).toBe('interrupted');
    expect(player.castingSkill).toBeNull();
    expect(activeCasts[cast.castId]).toBeUndefined();
    expect(player.skillCooldownEndTs.fireball).toBeUndefined();
    expect(events.find((e) => e.type === 'playerUpdated')).toBeDefined();
  });

  it('blocks the new action when the stat-based resist roll succeeds', () => {
    // physical skill (slash) → STR-based resist. With STR=80, p =
    // min(0.85, 80*0.012) = 0.85; an rng of 0 (always rolls under)
    // makes the resist fire deterministically.
    const player = createTransientPlayer('s3', 't3');
    player.castingSkill = 'slash';
    player.stats = { ...(player.stats ?? {}), str: 80 };
    const cast = makeCast(player.id, 'slash');
    const activeCasts: ActiveCastStore = { [cast.castId]: cast as never };
    const { sink } = captureOutbound();
    expect(tryInterruptForNewAction(player, activeCasts, sink, 'movement', () => 0)).toBe('block');
    // Cast is preserved when the resist holds.
    expect(activeCasts[cast.castId]).toBeDefined();
    expect(player.castingSkill).toBe('slash');
  });

  it('falls through to interrupt when the resist roll fails', () => {
    const player = createTransientPlayer('s4', 't4');
    player.castingSkill = 'slash';
    player.stats = { ...(player.stats ?? {}), str: 80 };
    player.mana = 0;
    const cast = makeCast(player.id, 'slash');
    const activeCasts: ActiveCastStore = { [cast.castId]: cast as never };
    const { sink } = captureOutbound();
    // rng=0.9999 → above resist (0.85) → interrupt proceeds.
    expect(tryInterruptForNewAction(player, activeCasts, sink, 'movement', () => 0.9999)).toBe('interrupted');
    expect(activeCasts[cast.castId]).toBeUndefined();
  });
});
