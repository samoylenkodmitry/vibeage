import type { GameClientState, VisualEvent } from './gameTypes';

const VISUAL_EVENT_VISIBLE_MS = 1_800;

export function addVisualEvent(
  state: GameClientState,
  event: Omit<VisualEvent, 'id'>,
): GameClientState {
  const sequence = state.nextVisualEventSeq;
  const id = `${event.kind}:${event.createdAt}:${sequence}`;
  return {
    ...state,
    nextVisualEventSeq: sequence + 1,
    visualEvents: {
      ...state.visualEvents,
      [id]: { id, ...event },
    },
  };
}

export function pruneVisualEvents(
  visualEvents: GameClientState['visualEvents'],
  now: number,
): GameClientState['visualEvents'] {
  return Object.fromEntries(
    Object.entries(visualEvents)
      .filter(([, event]) => now - event.createdAt < VISUAL_EVENT_VISIBLE_MS),
  );
}
