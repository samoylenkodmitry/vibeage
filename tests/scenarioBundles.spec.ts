import { describe, expect, it, vi } from 'vitest';
import { createGameState } from '../server/gameState';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createTransientPlayer } from '../server/playerFactory';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid';
import {
  createWorldCombatBridge,
  handleClientMessage,
} from '../server/world/clientMessageRouter';
import { tickCasts } from '../server/combat/skillSystem';
import { awardPlayerXP } from '../server/players/playerLifecycle';
import { handleEquipItem } from '../server/inventory/equipHandlers';
import { ensureCharacterInventory } from '../server/inventory/aggregateBridge';
import {
  buildStablePlayerPersistenceData,
} from '../server/persistence';
import { hydratePersistedPlayer } from '../server/players/playerSession';
import { forgetSocketRateLimits } from '../server/world/rateLimiter';
import { forgetMovementFreshness } from '../server/movement/staleIntentTracker';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { DirectMessageSink } from '../server/transport/outboundEvents';

const NOW = 1_700_000_000_000;

function captureOutbound(): { events: OutboundEvent[]; sink: OutboundEventSink } {
  const events: OutboundEvent[] = [];
  return { events, sink: { publish: (e) => events.push(e) } };
}

function captureDirect(): { sent: unknown[]; direct: DirectMessageSink } {
  const sent: unknown[] = [];
  return { sent, direct: { send: (m: unknown) => sent.push(m) } };
}

function joinNewPlayer(socketId: string, name: string) {
  forgetSocketRateLimits(socketId);
  forgetMovementFreshness(socketId);
  return createTransientPlayer(socketId, name);
}

describe('scenario: level-up updates stats', () => {
  it('reaching level threshold bumps level, restores HP/MP to new max, and refunds a skill point', () => {
    const player = joinNewPlayer('socketLU', 'LevelUpTester');
    player.level = 1;
    player.experience = 0;
    player.experienceToNextLevel = 100;
    player.availableSkillPoints = 0;
    const hp1 = player.maxHealth;
    const mp1 = player.maxMana;

    awardPlayerXP(player, 150, 'test');

    expect(player.level).toBe(2);
    expect(player.availableSkillPoints).toBe(1);
    expect(player.maxHealth).toBeGreaterThan(hp1);
    expect(player.maxMana).toBeGreaterThan(mp1);
    // Health/mana are FULLY restored on level-up (current behaviour).
    expect(player.health).toBe(player.maxHealth);
    expect(player.mana).toBe(player.maxMana);
  });

  it('preserves equipped item bonuses across level-up (regression: code review P1)', () => {
    const player = joinNewPlayer('socketLU2', 'EquipLevelUpTester');
    // Equip a worn_sword so the player has a non-zero pAtk from gear.
    const inv = ensureCharacterInventory(player);
    const instanceId = 'inst-lu-sword';
    inv.items[instanceId] = {
      instanceId,
      ownerId: player.id,
      templateId: 'worn_sword',
      location: { kind: 'inventory', slotIndex: 0 },
      count: 1,
      enchantLevel: 0,
      bound: false,
      createdAtTs: NOW,
    };
    player.inventory = [{ itemId: 'worn_sword', quantity: 1 }];
    const { direct } = captureDirect();
    handleEquipItem(player, { type: 'EquipItem', slotIndex: 0, requestedSlot: 'MAIN_HAND' }, direct);
    const pAtkWithSwordBeforeLevel = player.stats?.pAtk ?? 0;

    // Force level-up.
    player.level = 1;
    player.experience = 0;
    player.experienceToNextLevel = 100;
    awardPlayerXP(player, 200, 'level-up-equip-test');

    expect(player.level).toBe(2);
    // pAtk must include the equipped sword's bonus AFTER level-up.
    // Pre-fix the level-up recomputed stats with an empty equipment
    // block and the sword's contribution silently vanished.
    expect(player.stats?.pAtk ?? 0).toBeGreaterThanOrEqual(pAtkWithSwordBeforeLevel);
  });
});

describe('scenario: equip a weapon increases pAtk and cast damage', () => {
  it('equipping worn_sword increases the player pAtk stat', () => {
    const player = joinNewPlayer('socketEQ', 'EquipTester');
    const pAtkBefore = player.stats?.pAtk ?? 0;

    // Put a worn_sword into the player's inventory aggregate then equip slot 0.
    const inv = ensureCharacterInventory(player);
    const instanceId = 'inst-sword';
    inv.items[instanceId] = {
      instanceId,
      ownerId: player.id,
      templateId: 'worn_sword',
      location: { kind: 'inventory', slotIndex: 0 },
      count: 1,
      enchantLevel: 0,
      bound: false,
      createdAtTs: NOW,
    };
    player.inventory = [{ itemId: 'worn_sword', quantity: 1 }];

    const { direct } = captureDirect();
    handleEquipItem(player, { type: 'EquipItem', slotIndex: 0, requestedSlot: 'MAIN_HAND' }, direct);

    // handleEquipItem may regenerate the instance ID from the legacy bag —
    // we care that SOMETHING is equipped at MAIN_HAND, not the exact id.
    const equippedId = player.characterInventory?.equipment.MAIN_HAND;
    expect(equippedId).toBeDefined();
    expect(player.characterInventory?.items[equippedId!]?.templateId).toBe('worn_sword');
    expect(player.stats?.pAtk ?? 0).toBeGreaterThan(pAtkBefore);
  });
});

describe('scenario: persistence round-trip', () => {
  it('hydrated player retains class, race, level, skills, and equipment', () => {
    const original = joinNewPlayer('socketP', 'PersistTester');
    original.level = 7;
    original.className = 'rogue';
    original.race = 'dark_elf';
    original.unlockedSkills = ['evade', 'backstab'];
    original.availableSkillPoints = 2;
    // Equip a worn_sword by hand in the aggregate.
    const inv = ensureCharacterInventory(original);
    const sword = {
      instanceId: 'inst-persist-sword',
      ownerId: original.id,
      templateId: 'worn_sword',
      location: { kind: 'equipped' as const, slot: 'MAIN_HAND' as const },
      count: 1,
      enchantLevel: 0,
      bound: false,
      createdAtTs: NOW,
    };
    inv.items[sword.instanceId] = sword;
    inv.equipment.MAIN_HAND = sword.instanceId;

    const row = buildStablePlayerPersistenceData(original, NOW);
    const hydrated = hydratePersistedPlayer(
      { id: original.id, ...row },
      'socketP-reconnect',
      'PersistTester',
    );

    expect(hydrated.className).toBe('rogue');
    expect(hydrated.race).toBe('dark_elf');
    expect(hydrated.level).toBe(7);
    expect(hydrated.unlockedSkills).toContain('evade');
    expect(hydrated.unlockedSkills).toContain('backstab');
    expect(hydrated.availableSkillPoints).toBe(2);
    expect(hydrated.characterInventory?.equipment.MAIN_HAND).toBe('inst-persist-sword');
  });
});

describe('scenario: damage flow — player casts fireball at enemy and kills it', () => {
  it('mage casts fireball at low-HP enemy → enemy dies, isAlive=false, deathTimeTs set', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const state = createGameState();
      const spatial = new SpatialHashGrid(50);
      const player = joinNewPlayer('socketKill', 'KillTester');
      player.position = { x: 0, y: 0.5, z: 0 };
      state.players[player.id] = player;
      spatial.insert(player.id, { x: 0, z: 0 });
      const { sink } = captureOutbound();
      const socket = { id: 'socketKill', emit: vi.fn() };

      // Spawn a low-HP goblin within fireball range.
      const goblin = createEnemy('goblin', 1, { x: 8, y: 0.5, z: 0 }, NOW);
      goblin.health = 5; // glass jaw
      state.enemies[goblin.id] = goblin;
      spatial.insert(goblin.id, { x: 8, z: 0 });

      handleClientMessage(
        socket,
        state,
        { type: 'CastReq', id: player.id, skillId: 'fireball', targetId: goblin.id, clientTs: NOW },
        sink,
        spatial,
      );

      const world = createWorldCombatBridge(state, sink, spatial);
      // fireball castMs=300, then projectile travels. Advance generously
      // and tick repeatedly so impact resolves.
      for (let i = 0; i < 30; i++) {
        vi.advanceTimersByTime(100);
        tickCasts(state.activeCasts, 100, sink, world);
      }

      expect(goblin.health).toBe(0);
      expect(goblin.isAlive).toBe(false);
      expect(goblin.deathTimeTs).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
