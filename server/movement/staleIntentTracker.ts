/**
 * Per-socket movement-intent freshness gate.
 *
 * The client sends `clientTs` on every MoveIntent. We track the most
 * recent accepted `clientTs` per socket and reject:
 * - Out-of-order intents (clientTs <= last accepted)
 * - Wildly-skewed intents whose clientTs is too far from server time
 *   (positive skew implies a forged future timestamp; large negative
 *   skew implies a replayed old packet).
 *
 * Both are silently dropped at the router; counters surface in
 * `/runtimez` so abuse spikes are visible. The skew tolerance is
 * generous enough to absorb normal client clock drift.
 */

/** Largest tolerated clock skew (ms) between clientTs and server time. */
export const MAX_CLIENT_CLOCK_SKEW_MS = 30_000;

type Entry = { lastClientTs: number };

export type StaleIntentReason = 'outOfOrder' | 'clockSkew';

export class MovementIntentFreshness {
  private readonly entries = new Map<string, Entry>();

  /**
   * Returns null on accept. Returns a reason string on reject; the
   * caller is expected to drop the message and increment a counter.
   */
  check(
    socketId: string,
    clientTs: number,
    nowMs: number = Date.now(),
  ): StaleIntentReason | null {
    if (Math.abs(clientTs - nowMs) > MAX_CLIENT_CLOCK_SKEW_MS) {
      return 'clockSkew';
    }

    const existing = this.entries.get(socketId);
    if (existing && clientTs <= existing.lastClientTs) {
      return 'outOfOrder';
    }

    this.entries.set(socketId, { lastClientTs: clientTs });
    return null;
  }

  forget(socketId: string): void {
    this.entries.delete(socketId);
  }
}

const sharedFreshness = new MovementIntentFreshness();

export function sharedMovementFreshness(): MovementIntentFreshness {
  return sharedFreshness;
}

export function forgetMovementFreshness(socketId: string): void {
  sharedFreshness.forget(socketId);
}
