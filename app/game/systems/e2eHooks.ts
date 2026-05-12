import { VecXZ } from '../../../packages/protocol/messages';
import { useGameStore } from './gameStore';
import { useProjectileStore } from './projectileStore';

interface E2EGameHooks {
  getState: () => {
    myPlayerId: string | null;
    selectedTargetId: string | null;
    enemyIds: string[];
    targetWorldPos: { x: number; y: number; z: number } | null;
    lastKnownPlayerPosition: VecXZ | null;
    liveProjectileSkillIds: string[];
  };
  selectFirstEnemy: () => string | null;
  sendMoveIntent: (targetPos: VecXZ) => void;
}

type E2EWindow = typeof window & { __VIBEAGE_E2E__?: E2EGameHooks };

export function installE2EHooks(): (() => void) | undefined {
  if (process.env.NEXT_PUBLIC_E2E !== '1') {
    return undefined;
  }

  const browserWindow = window as E2EWindow;
  browserWindow.__VIBEAGE_E2E__ = {
    getState: () => {
      const state = useGameStore.getState();
      const myPlayerId = state.myPlayerId;
      return {
        myPlayerId,
        selectedTargetId: state.selectedTargetId,
        enemyIds: Object.keys(state.enemies),
        targetWorldPos: state.targetWorldPos,
        lastKnownPlayerPosition: myPlayerId ? state.serverLastKnownPositions[myPlayerId] ?? null : null,
        liveProjectileSkillIds: Object.values(useProjectileStore.getState().live).map((projectile) => projectile.skillId),
      };
    },
    selectFirstEnemy: () => {
      const state = useGameStore.getState();
      const enemyId = Object.keys(state.enemies)[0] ?? null;
      if (enemyId) {
        state.selectTarget(enemyId);
      }
      return enemyId;
    },
    sendMoveIntent: (targetPos: VecXZ) => {
      useGameStore.getState().sendMoveIntent(targetPos);
    },
  };

  return () => {
    delete browserWindow.__VIBEAGE_E2E__;
  };
}
