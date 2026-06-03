import { describe, expect, it } from 'vitest';
import { SKILLS } from '../packages/content/skills';
import { CastState } from '../packages/protocol/messages';
import {
  gameClientReducer,
  initialGameClientState,
} from '../apps/client/src/gameReducer';
import type { PlayerEntity } from '../apps/client/src/gameTypes';

const basePlayer: PlayerEntity = {
  id: 'player-1',
  socketId: 'socket-1',
  name: 'Tester',
  position: { x: 0, y: 0.5, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  mana: 80,
  maxMana: 100,
  className: 'mage',
  level: 1,
  experience: 20,
  experienceToNextLevel: 100,
  isAlive: true,
  unlockedSkills: ['fireball'],

  availableSkillPoints: 0,
  skillCooldownEndTs: {},
  castingSkill: null,
  castingProgressMs: 0,
  statusEffects: [],
  inventory: [{ itemId: 'health_potion', quantity: 2 }],
  maxInventorySlots: 20,
};

describe('Vite game client reducer', () => {
  it('tracks Colyseus public world state separately from gameplay snapshots', () => {
    const state = gameClientReducer(initialGameClientState, {
      type: 'worldPublicState',
      state: {
        revision: 2,
        playerCount: 1,
        enemyCount: 8,
        aliveEnemyCount: 7,
        activeRegionCount: 1,
        regionCount: 3,
        players: {},
        regions: {
          starter: {
            id: 'starter',
            zoneId: 'starter',
            name: 'Starter',
            active: true,
            playerCount: 1,
            enemyCount: 8,
            aliveEnemyCount: 7,
            maxEnemies: 10,
          },
        },
      },
    });

    expect(state.worldPublicState?.activeRegionCount).toBe(1);
    expect(state.players).toEqual({});
    expect(state.enemies).toEqual({});
  });

  it('normalizes server game state inventory and ground loot', () => {
    const joined = gameClientReducer(initialGameClientState, { type: 'joined', playerId: 'player-1' });
    const state = gameClientReducer(joined, {
      type: 'gameState',
      state: {
        players: { 'player-1': basePlayer },
        enemies: {
          'enemy-1': {
            id: 'enemy-1',
            type: 'goblin',
            name: 'Goblin',
            level: 1,
            position: { x: 8, y: 0.5, z: 4 },
            rotation: { x: 0, y: 0, z: 0 },
            health: 20,
            maxHealth: 20,
            isAlive: true,
          },
        },
        groundLoot: {
          loot1: {
            position: { x: 4, z: 6 },
            items: [{ itemId: 'gold_coin', quantity: 3 }],
          },
        },
        activePhysicsFields: {
          field1: {
            id: 'field1',
            kind: 'timeStop',
            sourceSkill: 'time_sphere',
            casterId: 'player-1',
            origin: { x: 4, z: 6 },
            radius: 8,
            startTimeTs: 100,
            durationMs: 3500,
          },
        },
        zones: {
          playerZoneIds: { 'player-1': 'starter-field' },
          enemyZoneIds: { 'enemy-1': 'starter-field' },
        },
      },
    });

    expect(state.inventory).toEqual([{ itemId: 'health_potion', quantity: 2 }]);
    expect(state.maxInventorySlots).toBe(20);
    expect(state.groundLoot.loot1.position).toEqual({ x: 4, y: 0.35, z: 6 });
    expect(state.activePhysicsFields.field1.radius).toBe(8);
    expect(state.streamedRegionIds).toEqual(['starter-field']);
  });
});

describe('Vite game client reducer time freeze fields', () => {
  it('stores physics field snapshots and prunes expired fields on update', () => {
    const state = gameClientReducer({
      ...initialGameClientState,
      activePhysicsFields: {
        expired: {
          id: 'expired',
          kind: 'timeStop',
          sourceSkill: 'time_sphere',
          casterId: 'player-2',
          origin: { x: 0, z: 0 },
          radius: 8,
          startTimeTs: 0,
          durationMs: 100,
        },
      },
    }, {
      type: 'serverMessage',
      now: 200,
      message: {
        type: 'PhysicsFieldSnapshot',
        field: {
          id: 'field1',
          kind: 'timeStop',
          sourceSkill: 'time_sphere',
          casterId: 'player-1',
          origin: { x: 4, z: 6 },
          radius: 8,
          startTimeTs: 200,
          durationMs: 3500,
        },
      },
    });

    expect(Object.keys(state.activePhysicsFields)).toEqual(['field1']);
    expect(state.activePhysicsFields.field1.origin).toEqual({ x: 4, z: 6 });

    const pruned = gameClientReducer(state, { type: 'pruneCasts', now: 3_800 });
    expect(pruned.activePhysicsFields).toEqual({});
  });
});

describe('Vite game client reducer inventory and loot messages', () => {
  it('tracks loot spawns and pickup removal', () => {
    const withLoot = gameClientReducer(initialGameClientState, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'LootSpawn',
        enemyId: 'enemy-1',
        lootId: 'loot1',
        position: { x: 1, y: 0.2, z: 2 },
        loot: [{ itemId: 'gold_coin', quantity: 1 }],
      },
    });
    const withoutLoot = gameClientReducer(withLoot, {
      type: 'serverMessage',
      now: 200,
      message: { type: 'LootPickup', lootId: 'loot1', playerId: 'player-2' },
    });

    expect(withLoot.groundLoot.loot1.items).toEqual([{ itemId: 'gold_coin', quantity: 1 }]);
    expect(withoutLoot.groundLoot.loot1).toBeUndefined();
    expect(withoutLoot.combatLog[0].text).toContain('picked up loot');
  });

  it('updates inventory after item use', () => {
    const state = {
      ...initialGameClientState,
      inventory: [{ itemId: 'health_potion', quantity: 2 }],
      maxInventorySlots: 20,
    };
    const nextState = gameClientReducer(state, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'ItemUsed',
        slotIndex: 0,
        itemId: 'health_potion',
        newQuantity: 1,
        healthDelta: 25,
      },
    });

    expect(nextState.inventory).toEqual([{ itemId: 'health_potion', quantity: 1 }]);
    expect(nextState.combatLog[0].text).toContain('Health Potion');
    expect(nextState.combatLog[0].text).toContain('+25 HP');
  });

  it('compacts inventory after the server consumes the last item in a slot', () => {
    const state = {
      ...initialGameClientState,
      inventory: [
        { itemId: 'mana_potion', quantity: 1 },
        { itemId: 'health_potion', quantity: 1 },
      ],
      maxInventorySlots: 20,
    };

    const nextState = gameClientReducer(state, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'ItemUsed',
        slotIndex: 0,
        itemId: 'mana_potion',
        newQuantity: 0,
        manaDelta: 80,
      },
    });

    expect(nextState.inventory).toEqual([{ itemId: 'health_potion', quantity: 1 }]);
  });
});

describe('Vite game client reducer visual events', () => {
  it('adds recovery visual events after local item use', () => {
    const state = {
      ...initialGameClientState,
      myPlayerId: 'player-1',
      players: { 'player-1': basePlayer },
      inventory: [{ itemId: 'health_potion', quantity: 2 }],
    };

    const nextState = gameClientReducer(state, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'ItemUsed',
        slotIndex: 0,
        itemId: 'health_potion',
        newQuantity: 1,
        healthDelta: 25,
        manaDelta: 10,
      },
    });

    expect(Object.values(nextState.visualEvents)).toContainEqual(expect.objectContaining({
      kind: 'healing',
      amount: 25,
      position: basePlayer.position,
    }));
    expect(Object.values(nextState.visualEvents)).toContainEqual(expect.objectContaining({
      kind: 'mana',
      amount: 10,
      position: basePlayer.position,
    }));
  });

  it('uses monotonic visual event ids after pruning old events', () => {
    const state = {
      ...initialGameClientState,
      myPlayerId: 'player-1',
      players: { 'player-1': basePlayer },
      inventory: [{ itemId: 'health_potion', quantity: 2 }],
    };

    const withFirstEvent = gameClientReducer(state, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'ItemUsed',
        slotIndex: 0,
        itemId: 'health_potion',
        newQuantity: 1,
        healthDelta: 25,
      },
    });
    const pruned = gameClientReducer(withFirstEvent, { type: 'pruneCasts', now: 2_000 });
    const withSecondEvent = gameClientReducer(pruned, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'ItemUsed',
        slotIndex: 0,
        itemId: 'health_potion',
        newQuantity: 0,
        healthDelta: 25,
      },
    });

    expect(Object.keys(withFirstEvent.visualEvents)).toEqual(['healing:100:0']);
    expect(Object.keys(pruned.visualEvents)).toEqual([]);
    expect(Object.keys(withSecondEvent.visualEvents)).toEqual(['healing:100:1']);
    expect(withSecondEvent.nextVisualEventSeq).toBe(2);
  });
});

describe('Vite game client reducer cast visual events', () => {
  it('adds impact visual events for water splash and prunes old visual events', () => {
    const onlineState = {
      ...initialGameClientState,
      connectionState: 'online' as const,
      message: 'Online',
    };
    const withImpact = gameClientReducer(onlineState, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'CastSnapshot',
        data: {
          castId: 'cast-1',
          casterId: 'player-1',
          skillId: 'waterSplash',
          state: CastState.Impact,
          origin: { x: 0, z: 0 },
          pos: { x: 3, z: 4 },
          startedAt: 0,
          castTimeMs: 100,
          progressMs: 100,
        },
      },
    });
    const pruned = gameClientReducer(withImpact, { type: 'pruneCasts', now: 2_000 });

    expect(Object.values(withImpact.visualEvents)).toContainEqual(expect.objectContaining({
      kind: 'splash',
      radius: SKILLS.waterSplash.area,
      position: { x: 3, y: 0.35, z: 4 },
    }));
    expect(withImpact.message).toBe('Online');
    expect(Object.keys(pruned.visualEvents)).toHaveLength(0);
  });

  it('adds a flavored reaction burst visual event when a combo reaction fires', () => {
    const onlineState = {
      ...initialGameClientState,
      connectionState: 'online' as const,
      message: 'Online',
    };
    const withBurst = gameClientReducer(onlineState, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'ReactionTriggered',
        reactionId: 'detonate_burn',
        flavor: 'fire',
        position: { x: 5, y: 1, z: -3 },
        targetId: 'enemy-1',
      },
    });

    expect(Object.values(withBurst.visualEvents)).toContainEqual(expect.objectContaining({
      kind: 'reaction',
      color: '#ff6a1a',   // REACTION_VFX.fire.color
      accent: '#facc15',  // REACTION_VFX.fire.accent
      position: { x: 5, y: 1, z: -3 },
    }));
    expect(withBurst.message).toBe('Online');
  });

  it('keeps cast failures out of connection status text', () => {
    const onlineState = {
      ...initialGameClientState,
      connectionState: 'online' as const,
      message: 'Online',
    };
    // §52 #1 — CastFail retired; the same combat-log line now comes
    // from CommandRejected{commandType:'CastReq'}.
    const nextState = gameClientReducer(onlineState, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'CommandRejected',
        commandType: 'CastReq',
        reason: 'outofrange',
        requestId: 1,
      },
    });

    expect(nextState.message).toBe('Online');
    // §52 polish — out-of-range now reads as a friendly sentence
    // instead of the raw enum string.
    expect(nextState.combatLog[0].text).toBe('Cast failed: target out of range.');
  });
});

describe('Vite game client reducer inventory ownership', () => {
  it('does not replace local inventory with another player inventory update', () => {
    const otherPlayer = { ...basePlayer, id: 'player-2', name: 'Other' };
    const state = {
      ...initialGameClientState,
      myPlayerId: 'player-1',
      players: {
        'player-1': basePlayer,
        'player-2': otherPlayer,
      },
      inventory: [{ itemId: 'health_potion', quantity: 2 }],
      maxInventorySlots: 20,
    };
    const nextState = gameClientReducer(state, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'InventoryUpdate',
        playerId: 'player-2',
        inventory: [{ itemId: 'gold_coin', quantity: 9 }],
        maxInventorySlots: 30,
      },
    });

    expect(nextState.inventory).toEqual([{ itemId: 'health_potion', quantity: 2 }]);
    expect(nextState.maxInventorySlots).toBe(20);
    expect(nextState.players['player-2'].inventory).toEqual([{ itemId: 'gold_coin', quantity: 9 }]);
    expect(nextState.players['player-2'].maxInventorySlots).toBe(30);
  });
});

describe('Vite game client starter progress', () => {
  it('uses server progress updates and keeps combat messages presentation-only', () => {
    const joined = gameClientReducer({
      ...initialGameClientState,
      myPlayerId: 'player-1',
      players: { 'player-1': basePlayer },
      enemies: {
        'enemy-1': {
          id: 'enemy-1',
          type: 'slime',
          name: 'Slime',
          level: 1,
          position: { x: 2, y: 0.5, z: 3 },
          rotation: { x: 0, y: 0, z: 0 },
          health: 0,
          maxHealth: 20,
          isAlive: false,
        },
      },
    }, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'CombatLog',
        castId: 'cast-1',
        skillId: 'fireball',
        casterId: 'player-1',
        targets: ['enemy-1'],
        damages: [22],
      },
    });
    const withLoot = gameClientReducer(joined, {
      type: 'serverMessage',
      now: 200,
      message: {
        type: 'LootAcquired',
        items: [
          { itemId: 'gold_coin', quantity: 2 },
          { itemId: 'slime_jelly', quantity: 1 },
        ],
      },
    });
    const withProgress = gameClientReducer(withLoot, {
      type: 'serverMessage',
      now: 300,
      message: {
        type: 'StarterProgressUpdate',
        progress: {
          defeatedEnemies: 1,
          defeatedEnemyIds: ['enemy-1'],
          lootPickups: 3,
          levelReached: 1,
          learnedSkills: 1,
          isComplete: false,
          rewardGranted: false,
        },
      },
    });

    expect(joined.starterProgress.defeatedEnemies).toBe(0);
    expect(Object.values(joined.visualEvents)).toContainEqual(expect.objectContaining({
      kind: 'damage',
      amount: 22,
      position: { x: 2, y: 0.5, z: 3 },
    }));
    expect(withLoot.starterProgress.lootPickups).toBe(0);
    expect(withProgress.starterProgress).toMatchObject({
      defeatedEnemies: 1,
      lootPickups: 3,
    });
  });

  it('assigns a learned skill to the first empty shortcut for immediate use', () => {
    const state = {
      ...initialGameClientState,
      myPlayerId: 'player-1',
      players: { 'player-1': { ...basePlayer, level: 2, availableSkillPoints: 1 } },
    };
    const nextState = gameClientReducer(state, {
      type: 'serverMessage',
      now: 100,
      message: {
        type: 'SkillLearned',
        skillId: 'waterSplash',
        remainingPoints: 0,
      },
    });

    expect(nextState.players['player-1'].unlockedSkills).toContain('waterSplash');
  });
});

describe('Vite game client reducer self-target', () => {
  it('selects the player as their own target when targetId === myPlayerId', () => {
    const state = {
      ...initialGameClientState,
      myPlayerId: 'player-1',
      players: { 'player-1': basePlayer },
    };

    const nextState = gameClientReducer(state, { type: 'selectTarget', targetId: 'player-1' });
    expect(nextState.selectedTargetId).toBe('player-1');
  });

  it('rejects a non-self id that is not a live enemy', () => {
    const state = {
      ...initialGameClientState,
      myPlayerId: 'player-1',
      players: { 'player-1': basePlayer },
    };

    const nextState = gameClientReducer(state, { type: 'selectTarget', targetId: 'ghost-id' });
    expect(nextState.selectedTargetId).toBeNull();
  });

  it('clears the selection when targetId is null', () => {
    const state = {
      ...initialGameClientState,
      myPlayerId: 'player-1',
      players: { 'player-1': basePlayer },
      selectedTargetId: 'player-1',
    };

    const nextState = gameClientReducer(state, { type: 'selectTarget', targetId: null });
    expect(nextState.selectedTargetId).toBeNull();
  });
});

describe('Vite game client reducer pending cast', () => {
  it('stores and clears a pending approach-and-cast entry', () => {
    const set = gameClientReducer(initialGameClientState, {
      type: 'setPendingCast',
      pendingCast: { skillId: 'slash', targetId: 'enemy-7', expiresAtTs: 1234 },
    });
    expect(set.pendingCast).toEqual({ skillId: 'slash', targetId: 'enemy-7', expiresAtTs: 1234 });

    const cleared = gameClientReducer(set, { type: 'clearPendingCast' });
    expect(cleared.pendingCast).toBeNull();
  });
});

describe('Vite game client reducer auto-attack', () => {
  it('stores and clears an auto-attack latch', () => {
    const set = gameClientReducer(initialGameClientState, {
      type: 'setAutoAttack',
      autoAttack: { skillId: 'basicAttack', targetId: 'goblin-3' },
    });
    expect(set.autoAttack).toEqual({ skillId: 'basicAttack', targetId: 'goblin-3' });

    const cleared = gameClientReducer(set, { type: 'clearAutoAttack' });
    expect(cleared.autoAttack).toBeNull();
  });
});
