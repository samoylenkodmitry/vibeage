import type { SkillId } from '../../../packages/content/skills';
import type { VecXZ } from '../../../packages/protocol/messages';
import type { ClientActions } from './clientActions';
import type { GameClientState, Vec3 } from './gameTypes';

export function installE2EHooks(state: GameClientState, api: ClientActions) {
  window.__VIBEAGE_VITE_E2E__ = {
    getState: () => ({
      connectionState: state.connectionState,
      reconnectState: {
        connectionState: state.connectionState,
        message: state.message,
      },
      myPlayerId: state.myPlayerId,
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
      inventoryItems: state.inventory.map((slot) => ({ itemId: slot.itemId, quantity: slot.quantity })),
      groundLootIds: Object.keys(state.groundLoot),
      castSkillIds: Object.values(state.casts).map((cast) => cast.snapshot.skillId),
      visualEventKinds: Object.values(state.visualEvents).map((event) => event.kind),
      liveProjectileSkillIds: Object.values(state.casts)
        .filter((cast) => cast.snapshot.state !== 2)
        .map((cast) => cast.snapshot.skillId),
    }),
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
        inventoryItems: { itemId: string; quantity: number }[];
        groundLootIds: string[];
        castSkillIds: SkillId[];
        visualEventKinds: string[];
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
    };
  }
}
