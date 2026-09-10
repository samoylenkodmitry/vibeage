import type { GameClientState, VisualEvent } from './gameTypes';
import type { DamageNumberVariant } from './damageNumberTexture';

const VISUAL_EVENT_VISIBLE_MS = 1_800;

/**
 * Presentation-only trim attached to a visual event.
 *
 * It lives in a module-side table keyed by event id rather than on the
 * `VisualEvent` itself: this is pure "how should it look" (which never crosses
 * the wire, never round-trips through a snapshot, and is meaningless to the
 * combat reducers), and the shared event shape stays about *what happened*.
 * The table is pruned in lockstep with the events, so it cannot outlive them.
 */
export type VisualEventMeta = {
  /** How the floating number should read at a glance. */
  variant: DamageNumberVariant;
  /** 0..1 weight of the hit — scales the impact punch. */
  severity: number;
  /** This blow finished the target. */
  lethal: boolean;
};

const eventMeta = new Map<string, { meta: VisualEventMeta; createdAt: number }>();

export function addVisualEvent(
  state: GameClientState,
  event: Omit<VisualEvent, 'id'>,
  meta?: VisualEventMeta,
): GameClientState {
  const sequence = state.nextVisualEventSeq;
  const id = `${event.kind}:${event.createdAt}:${sequence}`;
  if (meta) eventMeta.set(id, { meta, createdAt: event.createdAt });
  return {
    ...state,
    nextVisualEventSeq: sequence + 1,
    visualEvents: {
      ...state.visualEvents,
      [id]: { id, ...event },
    },
  };
}

/** Presentation trim for an event, when the emitter attached any. */
export function getVisualEventMeta(id: string): VisualEventMeta | undefined {
  return eventMeta.get(id)?.meta;
}

export function pruneVisualEvents(
  visualEvents: GameClientState['visualEvents'],
  now: number,
): GameClientState['visualEvents'] {
  // Age out the trim on the same clock as the events themselves, rather than by
  // diffing against the surviving map — the showroom drives its own event map
  // through here, and an id-set diff would let one map evict the other's trim.
  for (const [id, entry] of eventMeta) {
    if (now - entry.createdAt >= VISUAL_EVENT_VISIBLE_MS) eventMeta.delete(id);
  }
  return Object.fromEntries(
    Object.entries(visualEvents)
      .filter(([, event]) => now - event.createdAt < VISUAL_EVENT_VISIBLE_MS),
  );
}
