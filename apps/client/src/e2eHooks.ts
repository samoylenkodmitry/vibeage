import type { SkillId } from '../../../packages/content/skills';
import type { VecXZ } from '../../../packages/protocol/messages';
import type { ClientActions } from './clientActions';
import type { GameClientState, Vec3 } from './gameTypes';

function buildE2EState(state: GameClientState) {
  return {
      connectionState: state.connectionState,
      reconnectState: {
        connectionState: state.connectionState,
        message: state.message,
      },
      myPlayerId: state.myPlayerId,
      // Identity — lets the onboarding e2e assert a Nameless guest actually
      // became the race/prophecy/name they picked in the Awakening panel.
      playerName: state.myPlayerId ? state.players[state.myPlayerId]?.name ?? null : null,
      playerRace: state.myPlayerId ? state.players[state.myPlayerId]?.race ?? null : null,
      playerClass: state.myPlayerId ? state.players[state.myPlayerId]?.className ?? null : null,
      enemyIds: Object.values(state.enemies).filter((enemy) => enemy.isAlive).map((enemy) => enemy.id),
      streamedRegionIds: state.streamedRegionIds,
      visibleEntityCounts: {
        players: Object.keys(state.players).length,
        enemies: Object.values(state.enemies).filter((enemy) => enemy.isAlive).length,
        groundLoot: Object.keys(state.groundLoot).length,
        casts: Object.keys(state.casts).length,
      },
      selectedTargetId: state.selectedTargetId,
      targetWorldPos: state.targetWorldPos,
      lastKnownPlayerPosition: state.myPlayerId ? state.players[state.myPlayerId]?.position ?? null : null,
      playerVitals: state.myPlayerId ? {
        health: state.players[state.myPlayerId]?.health ?? 0,
        maxHealth: state.players[state.myPlayerId]?.maxHealth ?? 0,
        mana: state.players[state.myPlayerId]?.mana ?? 0,
        maxMana: state.players[state.myPlayerId]?.maxMana ?? 0,
        level: state.players[state.myPlayerId]?.level ?? 1,
        experience: state.players[state.myPlayerId]?.experience ?? 0,
        experienceToNextLevel: state.players[state.myPlayerId]?.experienceToNextLevel ?? 100,
        isAlive: state.players[state.myPlayerId]?.isAlive ?? false,
      } : null,
      starterProgress: state.starterProgress,
      inventoryItems: state.inventory.map((slot) => ({ itemId: slot.itemId, quantity: slot.quantity, slotIndex: slot.slotIndex })),
      maxInventorySlots: state.maxInventorySlots,
      groundLootPositions: Object.values(state.groundLoot).map((stack) => ({ id: stack.id, x: stack.position.x, z: stack.position.z })),
      groundLootIds: Object.keys(state.groundLoot),
      castSkillIds: Object.values(state.casts).map((cast) => cast.snapshot.skillId),
      visualEventKinds: Object.values(state.visualEvents).map((event) => event.kind),
      // Archwork item #1 — `visualEvents` are pruned ~1.8 s after they
      // fire. On the slow GitHub runner the Fireball E2E's Phase 2
      // can start polling AFTER the damage popup has already been
      // pruned, even though the cast landed (proven by the combat
      // log entry that persists for 200 lines / many minutes). Expose
      // combat log text so the test has a persistent signal to wait
      // on instead of racing the visual-event ttl.
      combatLogTexts: state.combatLog.map((line) => line.text),
      liveProjectileSkillIds: Object.values(state.casts)
        .filter((cast) => cast.snapshot.state !== 2)
        .map((cast) => cast.snapshot.skillId),
  };
}

export function installE2EHooks(state: GameClientState, api: ClientActions) {
  window.__VIBEAGE_VITE_E2E__ = {
    getState: () => buildE2EState(state),
    sendMoveIntent: api.sendMoveIntent,
    selectFirstEnemy: () => {
      // Archwork item #1 — skip mini-bosses. The starter zone spawns
      // Grakk (level-5, 600 HP, 27-47 damage hits) as its mini-boss,
      // and `spawnInitialEnemies` inserts the mini-boss first per
      // zone — so a naïve "first alive enemy" picks the toughest
      // mob in the zone. A level-1 mage test player dies on approach
      // before a cast can land, and the combat-flow E2E times out
      // waiting for a damage visual event. Filter mini-bosses out so
      // the test exercises the cast pipeline against a normal mob.
      const enemy = Object.values(state.enemies)
        .find((candidate) => candidate.isAlive && !candidate.isMiniBoss);
      api.selectTarget(enemy?.id ?? null);
      return enemy?.id ?? null;
    },
    castSkill: api.castSkill,
    learnSkill: api.learnSkill,
    pickUpFirstLoot: () => {
      const loot = Object.values(state.groundLoot)[0];
      if (!loot) {
        return null;
      }

      api.pickUpLoot(loot.id);
      return loot.id;
    },
    moveNearPlayer: (offset = { x: 12, z: -8 }) => {
      const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
      if (!player) {
        return null;
      }

      const target = {
        x: player.position.x + offset.x,
        z: player.position.z + offset.z,
      };
      api.sendMoveIntent(target);
      return target;
    },
    useItem: api.useItem,
    respawn: api.respawn,
    // Test-only — grants via the server's GmCommand path (GM-gated there).
    grantItem: (itemId: string, count: number) => {
      api.gmCommand({ verb: 'grantItem', value: itemId, quantity: count });
    },
    // GM map travel — works on prod for logged-in accounts (GM-gated).
    gmTeleport: (x: number, z: number) => {
      api.devTeleport({ x, z });
    },
  };
}

declare global {
  interface Window {
    __VIBEAGE_VITE_E2E__?: {
      getState: () => {
        connectionState: GameClientState['connectionState'];
        reconnectState: {
          connectionState: GameClientState['connectionState'];
          message: string;
        };
        myPlayerId: string | null;
        playerName: string | null;
        playerRace: string | null;
        playerClass: string | null;
        enemyIds: string[];
        streamedRegionIds: string[];
        visibleEntityCounts: {
          players: number;
          enemies: number;
          groundLoot: number;
          casts: number;
        };
        selectedTargetId: string | null;
        targetWorldPos: Vec3 | null;
        lastKnownPlayerPosition: Vec3 | null;
        playerVitals: {
          health: number;
          maxHealth: number;
          mana: number;
          maxMana: number;
          level: number;
          experience: number;
          experienceToNextLevel: number;
          isAlive: boolean;
        } | null;
        starterProgress: GameClientState['starterProgress'];
        inventoryItems: { itemId: string; quantity: number; slotIndex?: number }[];
        maxInventorySlots: number;
        groundLootIds: string[];
        groundLootPositions: { id: string; x: number; z: number }[];
        castSkillIds: SkillId[];
        visualEventKinds: string[];
        combatLogTexts: string[];
        liveProjectileSkillIds: SkillId[];
      };
      sendMoveIntent: (target: VecXZ) => void;
      selectFirstEnemy: () => string | null;
      castSkill: (skillId: SkillId) => void;
      learnSkill: (skillId: SkillId) => void;
      pickUpFirstLoot: () => string | null;
      moveNearPlayer: (offset?: VecXZ) => VecXZ | null;
      useItem: (slotIndex: number) => void;
      respawn: () => void;
      grantItem: (itemId: string, count: number) => void;
      gmTeleport: (x: number, z: number) => void;
    };
  }
}
