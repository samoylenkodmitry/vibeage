import type { ServerMessage } from '../../../packages/protocol/messages';
import type { GameClientState, Vec3, VisualEvent } from './gameTypes';

export function addCombatDamageVisualEvents(
  state: GameClientState,
  message: ServerMessage & { type: 'CombatLog' },
  now: number,
): GameClientState {
  return message.targets.reduce((nextState, targetId, index) => {
    const entity = nextState.enemies[targetId] ?? nextState.players[targetId];
    const damage = message.damages[index] ?? 0;
    if (!entity || damage <= 0) {
      return nextState;
    }

    return addVisualEvent(nextState, {
      kind: 'damage',
      position: normalizeEventPosition(entity.position),
      amount: damage,
      createdAt: now + index,
    });
  }, state);
}

function addVisualEvent(
  state: GameClientState,
  event: Omit<VisualEvent, 'id'>,
): GameClientState {
  const id = `${event.kind}:${event.createdAt}:${Object.keys(state.visualEvents).length}`;
  return {
    ...state,
    visualEvents: {
      ...state.visualEvents,
      [id]: { id, ...event },
    },
  };
}

function normalizeEventPosition(position: { x: number; y?: number; z: number } | undefined): Vec3 {
  return {
    x: position?.x ?? 0,
    y: position?.y ?? 0.35,
    z: position?.z ?? 0,
  };
}
