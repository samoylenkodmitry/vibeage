import type { ServerMessage } from '../../../packages/protocol/messages';
import type { GameClientState, Vec3 } from './gameTypes';
import { addVisualEvent } from './visualEventState';

export function addCombatDamageVisualEvents(
  state: GameClientState,
  message: ServerMessage & { type: 'CombatLog' },
  now: number,
): GameClientState {
  return message.targets.reduce((nextState, targetId, index) => {
    const entity = nextState.enemies[targetId] ?? nextState.players[targetId];
    if (!entity) {
      return nextState;
    }
    const position = normalizeEventPosition(entity.position);

    // Miss + damage are mutually exclusive on the server side
    // (the trace either lands or whiffs), but client just trusts
    // whichever flag is set. A miss emits its own VisualEvent kind
    // so the world overlay can render "MISS" instead of a number.
    if (message.misses?.[index]) {
      return addVisualEvent(nextState, {
        kind: 'miss',
        position,
        createdAt: now + index,
      });
    }

    const damage = message.damages[index] ?? 0;
    if (damage <= 0) {
      return nextState;
    }

    return addVisualEvent(nextState, {
      kind: 'damage',
      position,
      amount: damage,
      isCrit: message.crits?.[index] ?? false,
      createdAt: now + index,
    });
  }, state);
}

function normalizeEventPosition(position: { x: number; y?: number; z: number } | undefined): Vec3 {
  return {
    x: position?.x ?? 0,
    y: position?.y ?? 0.35,
    z: position?.z ?? 0,
  };
}
