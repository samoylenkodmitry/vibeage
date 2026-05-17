import { describe, expect, it } from 'vitest';
import { applyClassChange, applyRaceChange } from '../server/players/playerIdentity';
import { canPlayerLearnSkill, learnNewSkill } from '../server/players/playerSkills';
import { createTransientPlayer } from '../server/playerFactory';
import {
  buildStablePlayerPersistenceData,
} from '../server/persistence';
import { hydratePersistedPlayer } from '../server/players/playerSession';
import { hydratePersistedCharacterInventory } from '../server/inventory/aggregateBridge';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';

function captureOutbound(): { events: OutboundEvent[]; sink: OutboundEventSink } {
  const events: OutboundEvent[] = [];
  return { events, sink: { publish: (e) => { events.push(e); } } };
}

describe('Fix #1: stats broadcast on class/race change', () => {
  it('applyClassChange emits a playerUpdated with the new derived stats', () => {
    const player = createTransientPlayer('s1', 'tester');
    const { events, sink } = captureOutbound();
    const statsBefore = { ...player.stats };

    applyClassChange(player, 'warrior', sink);

    const playerUpdate = events.find(e => e.type === 'playerUpdated');
    expect(playerUpdate).toBeDefined();
    if (playerUpdate?.type === 'playerUpdated') {
      expect(playerUpdate.update.stats).toBeDefined();
      // Warrior has different baseStats than mage (healthMultiplier 1.3 vs 0.8,
      // damageMultiplier 1.1 vs 1.2) so the projected stats must differ.
      expect(playerUpdate.update.stats).not.toEqual(statsBefore);
    }
  });

  it('applyRaceChange emits a playerUpdated with the new derived stats', () => {
    const player = createTransientPlayer('s1', 'tester');
    const { events, sink } = captureOutbound();
    const statsBefore = JSON.stringify(player.stats);

    applyRaceChange(player, 'orc', sink);

    const playerUpdate = events.find(e => e.type === 'playerUpdated');
    expect(playerUpdate).toBeDefined();
    if (playerUpdate?.type === 'playerUpdated') {
      expect(playerUpdate.update.stats).toBeDefined();
      // Orc has different per-stat race weights from the default race,
      // so the projection must differ.
      expect(JSON.stringify(playerUpdate.update.stats)).not.toBe(statsBefore);
    }
  });
});

describe('Fix #2: switching class actually unlocks the new starter skill', () => {
  it('switching mage → warrior drops fireball, unlocks slash, lets player learn bash', () => {
    const player = createTransientPlayer('s1', 'tester');
    player.level = 3;
    player.availableSkillPoints = 2;
    const { sink } = captureOutbound();

    applyClassChange(player, 'warrior', sink);

    // Slash is unlocked; fireball is dropped (no skill-accumulation
    // across class changes — that was the "new knight has fireball" bug).
    expect(player.unlockedSkills).toContain('slash');
    expect(player.unlockedSkills).not.toContain('fireball');
    expect(canPlayerLearnSkill(player, 'bash')).toBe(true);
    expect(learnNewSkill(player, 'bash')).toBe(true);
    expect(player.unlockedSkills).toContain('bash');
  });

  it('switching mage → rogue unlocks evade (rogue starter)', () => {
    const player = createTransientPlayer('s1', 'tester');
    const { sink } = captureOutbound();

    applyClassChange(player, 'rogue', sink);

    expect(player.unlockedSkills).toContain('evade');
  });

  it('switching mage → healer unlocks holyLight (healer starter)', () => {
    const player = createTransientPlayer('s1', 'tester');
    const { sink } = captureOutbound();

    applyClassChange(player, 'healer', sink);

    expect(player.unlockedSkills).toContain('holyLight');
  });

  it('switching BACK to mage re-unlocks fireball (full reset on every switch)', () => {
    const player = createTransientPlayer('s1', 'tester');
    const { sink } = captureOutbound();

    applyClassChange(player, 'warrior', sink); // drops fireball, adds slash
    expect(player.unlockedSkills).toEqual(['slash', 'basicAttack']);

    applyClassChange(player, 'mage', sink); // drops slash, adds fireball
    expect(player.unlockedSkills).toEqual(['fireball', 'basicAttack']);
    expect(player.skillShortcuts).toContain('fireball');
  });

  it('refunds previously-spent skill points so the player can re-spec for the new class', () => {
    const player = createTransientPlayer('s1', 'tester');
    player.level = 5;
    player.availableSkillPoints = 3;
    const { sink } = captureOutbound();

    // Pretend the player invested in 3 mage skills (fireball is the
    // free class starter; basicAttack is the free universal skill).
    player.unlockedSkills = ['fireball', 'basicAttack', 'waterSplash', 'iceBolt', 'smite'];
    player.availableSkillPoints = 0; // all spent

    applyClassChange(player, 'warrior', sink);

    // Starter + basicAttack are free; the 3 spent points are refunded.
    expect(player.unlockedSkills).toEqual(['slash', 'basicAttack']);
    expect(player.availableSkillPoints).toBe(3);
  });

  it('the new starter ends up in the skill bar (first empty shortcut slot)', () => {
    const player = createTransientPlayer('s1', 'tester');
    const { sink } = captureOutbound();

    applyClassChange(player, 'warrior', sink);

    expect(player.skillShortcuts).toContain('slash');
  });
});

describe('Fix #3: equipment persists across hydrate round-trip', () => {
  it('hydratePersistedCharacterInventory rebuilds an equipped MAIN_HAND from the persisted column', () => {
    const player = createTransientPlayer('s1', 'tester');
    const persistedAggregate = {
      characterId: player.id,
      items: {
        'inst-1': {
          instanceId: 'inst-1',
          ownerId: player.id,
          templateId: 'worn_sword',
          location: { kind: 'equipped' as const, slot: 'MAIN_HAND' as const },
          count: 1,
          enchantLevel: 0,
          bound: false,
          createdAtTs: 1_000,
        },
      },
      equipment: { MAIN_HAND: 'inst-1' },
      occupancy: {},
      limits: { baseSlots: 20, bonusSlots: 0, maxWeight: 80_000 },
    };

    hydratePersistedCharacterInventory(player, persistedAggregate);

    expect(player.characterInventory).toBeDefined();
    expect(player.characterInventory?.equipment.MAIN_HAND).toBe('inst-1');
    expect(player.characterInventory?.items['inst-1']?.templateId).toBe('worn_sword');
  });

  it('buildStablePlayerPersistenceData serialises characterInventory to the row', () => {
    const player = createTransientPlayer('s1', 'tester');
    player.characterInventory = {
      characterId: player.id,
      items: {
        'inst-1': {
          instanceId: 'inst-1',
          ownerId: player.id,
          templateId: 'worn_sword',
          location: { kind: 'equipped' as const, slot: 'MAIN_HAND' as const },
          count: 1,
          enchantLevel: 0,
          bound: false,
          createdAtTs: 1_000,
        },
      },
      equipment: { MAIN_HAND: 'inst-1' },
      occupancy: {},
      limits: { baseSlots: 20, bonusSlots: 0, maxWeight: 80_000 },
    };

    const row = buildStablePlayerPersistenceData(player, 2_000);

    expect(row.character_inventory).toBeDefined();
    expect(row.character_inventory?.equipment.MAIN_HAND).toBe('inst-1');
  });

  it('hydratePersistedCharacterInventory tolerates null without throwing or overwriting', () => {
    const player = createTransientPlayer('s1', 'tester');
    const before = player.characterInventory;
    expect(() => hydratePersistedCharacterInventory(player, null)).not.toThrow();
    // Null input is a no-op: caller falls back to the legacy bag path.
    expect(player.characterInventory).toBe(before);
  });

  it('hydratePersistedPlayer roundtrips an equipped weapon (persist → row → hydrate)', () => {
    const original = createTransientPlayer('s1', 'tester');
    original.characterInventory = {
      characterId: original.id,
      items: {
        'inst-1': {
          instanceId: 'inst-1',
          ownerId: original.id,
          templateId: 'worn_sword',
          location: { kind: 'equipped' as const, slot: 'MAIN_HAND' as const },
          count: 1,
          enchantLevel: 0,
          bound: false,
          createdAtTs: 1_000,
        },
      },
      equipment: { MAIN_HAND: 'inst-1' },
      occupancy: {},
      limits: { baseSlots: 20, bonusSlots: 0, maxWeight: 80_000 },
    };
    const row = buildStablePlayerPersistenceData(original, 2_000);

    const hydrated = hydratePersistedPlayer(
      { id: original.id, ...row },
      's2',
      'tester',
    );

    expect(hydrated.characterInventory?.equipment.MAIN_HAND).toBe('inst-1');
  });
});
