import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyGmCommand } from '../server/players/gmCommand';
import { createTransientPlayer } from '../server/playerFactory';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';

function captureOutbound(): { events: OutboundEvent[]; sink: OutboundEventSink } {
  const events: OutboundEvent[] = [];
  return { events, sink: { publish: (e) => events.push(e) } };
}

describe('applyGmCommand', () => {
  beforeEach(() => { process.env.VIBEAGE_ENABLE_DEV_COMMANDS = '1'; });
  afterEach(() => { delete process.env.VIBEAGE_ENABLE_DEV_COMMANDS; });

  it('is rejected when GM mode is off', () => {
    delete process.env.VIBEAGE_ENABLE_DEV_COMMANDS;
    const caller = createTransientPlayer('s1', 'gm');
    const { sink } = captureOutbound();
    expect(applyGmCommand(caller, { type: 'GmCommand', verb: 'grantXp', value: 100 }, () => undefined, sink)).toBe(false);
    expect(caller.experience).toBe(0);
  });

  it('grants XP when GM mode is on', () => {
    const caller = createTransientPlayer('s2', 'gm');
    const { sink } = captureOutbound();
    expect(applyGmCommand(caller, { type: 'GmCommand', verb: 'grantXp', value: 250 }, () => undefined, sink)).toBe(true);
    expect(caller.experience).toBe(250);
  });

  it('grants SP and bumps availableSkillPoints', () => {
    const caller = createTransientPlayer('s3', 'gm');
    const before = caller.availableSkillPoints;
    const { sink } = captureOutbound();
    applyGmCommand(caller, { type: 'GmCommand', verb: 'grantSp', value: 5 }, () => undefined, sink);
    expect(caller.availableSkillPoints).toBe(before + 5);
  });

  it('setLevel updates level field', () => {
    const caller = createTransientPlayer('s4', 'gm');
    const { sink } = captureOutbound();
    applyGmCommand(caller, { type: 'GmCommand', verb: 'setLevel', value: 35 }, () => undefined, sink);
    expect(caller.level).toBe(35);
  });

  it('setSpecialization with "none" clears the spec', () => {
    const caller = createTransientPlayer('s5', 'gm');
    caller.specializationId = 'arcanist';
    const { sink } = captureOutbound();
    applyGmCommand(caller, { type: 'GmCommand', verb: 'setSpecialization', value: 'none' }, () => undefined, sink);
    expect(caller.specializationId).toBeNull();
  });

  it('grantSkill adds the id to unlockedSkills and binds the first empty shortcut', () => {
    const caller = createTransientPlayer('s6', 'gm');
    // Use slash — default mage character doesn't have it (so the
    // grant actually mutates state and binds the next free slot).
    const firstEmptyBefore = caller.skillShortcuts.findIndex((s) => s === null);
    const { sink } = captureOutbound();
    applyGmCommand(caller, { type: 'GmCommand', verb: 'grantSkill', value: 'slash' }, () => undefined, sink);
    expect(caller.unlockedSkills).toContain('slash');
    if (firstEmptyBefore !== -1) {
      expect(caller.skillShortcuts[firstEmptyBefore]).toBe('slash');
    }
  });

  it('setLevel re-derives HP/MP caps + emits the new stats', () => {
    const caller = createTransientPlayer('s8', 'gm');
    const hpBefore = caller.maxHealth;
    const { events, sink } = captureOutbound();
    applyGmCommand(caller, { type: 'GmCommand', verb: 'setLevel', value: 40 }, () => undefined, sink);
    expect(caller.level).toBe(40);
    expect(caller.maxHealth).toBeGreaterThan(hpBefore);
    const last = events.find((e) => e.type === 'playerUpdated');
    expect(last).toBeDefined();
    if (last?.type === 'playerUpdated') {
      expect(last.update.maxHealth).toBe(caller.maxHealth);
      expect(last.update.stats).toBeDefined();
    }
  });

  it('rejects grantSkill for an unknown skill id', () => {
    const caller = createTransientPlayer('s7', 'gm');
    const { sink } = captureOutbound();
    expect(applyGmCommand(caller, { type: 'GmCommand', verb: 'grantSkill', value: 'not-a-skill' }, () => undefined, sink)).toBe(false);
  });
});
