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

  it('grants XP when GM mode is on (sub-level grant stays in current bucket)', () => {
    const caller = createTransientPlayer('s2', 'gm');
    const { sink } = captureOutbound();
    // 50 < the L1 threshold (100) so the player stays at L1 with 50 banked.
    expect(applyGmCommand(caller, { type: 'GmCommand', verb: 'grantXp', value: 50 }, () => undefined, sink)).toBe(true);
    expect(caller.level).toBe(1);
    expect(caller.experience).toBe(50);
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

  it('grantSkill adds the id to unlockedSkills', () => {
    const caller = createTransientPlayer('s6', 'gm');
    // Use slash — default mage character doesn't have it (so the
    // grant actually mutates state).
    const { sink } = captureOutbound();
    applyGmCommand(caller, { type: 'GmCommand', verb: 'grantSkill', value: 'slash' }, () => undefined, sink);
    expect(caller.unlockedSkills).toContain('slash');
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

describe('applyGmCommand — grants emit + level-up behaviour', () => {
  beforeEach(() => { process.env.VIBEAGE_ENABLE_DEV_COMMANDS = '1'; });
  afterEach(() => { delete process.env.VIBEAGE_ENABLE_DEV_COMMANDS; });

  it('grantXp big enough to level up multiple times bumps level + SP', () => {
    const caller = createTransientPlayer('s9', 'gm');
    const levelBefore = caller.level;
    const spBefore = caller.availableSkillPoints;
    const { events, sink } = captureOutbound();
    // L1 thresholds: 100, 150, 225, ... — 600 XP from L1 covers 100+150+225 = 475 with 125 left, so 3 level-ups.
    applyGmCommand(caller, { type: 'GmCommand', verb: 'grantXp', value: 600 }, () => undefined, sink);
    expect(caller.level).toBeGreaterThanOrEqual(levelBefore + 3);
    expect(caller.availableSkillPoints).toBeGreaterThanOrEqual(spBefore + 3);
    const last = events.find((e) => e.type === 'playerUpdated');
    if (last?.type === 'playerUpdated') {
      expect(last.update.level).toBe(caller.level);
      expect(last.update.experienceToNextLevel).toBe(caller.experienceToNextLevel);
    }
  });

  it('grantGold mutates PlayerState.gold and emits the new value', () => {
    const caller = createTransientPlayer('s10', 'gm');
    const before = caller.gold ?? 0;
    const { events, sink } = captureOutbound();
    applyGmCommand(caller, { type: 'GmCommand', verb: 'grantGold', value: 250 }, () => undefined, sink);
    expect(caller.gold).toBe(before + 250);
    const last = events.find((e) => e.type === 'playerUpdated');
    if (last?.type === 'playerUpdated') expect(last.update.gold).toBe(caller.gold);
  });

  it('grantItem emits a playerUpdated carrying the inventory wire projection', () => {
    const caller = createTransientPlayer('s11', 'gm');
    const { events, sink } = captureOutbound();
    applyGmCommand(caller, { type: 'GmCommand', verb: 'grantItem', value: 'health_potion', quantity: 3 }, () => undefined, sink);
    const last = events.find((e) => e.type === 'playerUpdated');
    expect(last).toBeDefined();
    if (last?.type === 'playerUpdated') {
      expect(last.update.inventory).toBeDefined();
      const found = last.update.inventory?.find((s) => s.itemId === 'health_potion');
      expect(found?.quantity).toBeGreaterThanOrEqual(3);
    }
  });

  it('setLevel awarded SP equal to the level delta when leveling up', () => {
    const caller = createTransientPlayer('s12', 'gm');
    const spBefore = caller.availableSkillPoints;
    const levelBefore = caller.level;
    const { sink } = captureOutbound();
    applyGmCommand(caller, { type: 'GmCommand', verb: 'setLevel', value: levelBefore + 10 }, () => undefined, sink);
    expect(caller.availableSkillPoints).toBe(spBefore + 10);
  });
});
