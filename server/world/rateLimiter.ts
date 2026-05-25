/**
 * Per-socket per-bucket token-bucket rate limiter.
 *
 * Each named bucket (movement, cast, chat, inventory, equipment, lifecycle)
 * has its own capacity and refill rate. Buckets start full; every accepted
 * action spends one token; tokens refill linearly over time. Buckets are
 * scoped per socket and dropped on disconnect.
 *
 * Tuning notes:
 * - movement: clients spam MoveIntent on tap-to-move; 20/sec average is
 *   already generous since the server-side throttle is 8.3Hz (120ms).
 * - cast: even Quickfire shouldn't exceed 6 casts/sec given cooldowns.
 * - chat: hard cap to protect the public channel.
 * - inventory/equip/lifecycle: rare actions; tight cap is fine.
 */
export type RateLimitBucket = 'movement' | 'cast' | 'chat' | 'inventory' | 'equipment' | 'lifecycle' | 'identity';

export type RateLimitConfig = {
  capacity: number;
  refillPerSecond: number;
};

export const RATE_LIMITS: Record<RateLimitBucket, RateLimitConfig> = {
  movement: { capacity: 25, refillPerSecond: 20 },
  cast: { capacity: 12, refillPerSecond: 6 },
  chat: { capacity: 6, refillPerSecond: 1 },
  inventory: { capacity: 12, refillPerSecond: 4 },
  equipment: { capacity: 12, refillPerSecond: 4 },
  lifecycle: { capacity: 6, refillPerSecond: 1.5 },
  identity: { capacity: 4, refillPerSecond: 0.5 },
};

type Bucket = { tokens: number; lastRefillMs: number };

export class SocketRateLimiter {
  private readonly buckets = new Map<string, Map<RateLimitBucket, Bucket>>();
  private readonly config: Record<RateLimitBucket, RateLimitConfig>;

  constructor(config: Record<RateLimitBucket, RateLimitConfig> = RATE_LIMITS) {
    this.config = config;
  }

  /** Returns true if the action is allowed, false if the bucket is empty. */
  allow(socketId: string, bucket: RateLimitBucket, nowMs: number = Date.now()): boolean {
    const limit = this.config[bucket];
    let perSocket = this.buckets.get(socketId);
    if (!perSocket) {
      perSocket = new Map();
      this.buckets.set(socketId, perSocket);
    }
    const existing = perSocket.get(bucket);
    if (!existing) {
      if (limit.capacity < 1) {
        return false;
      }
      perSocket.set(bucket, { tokens: limit.capacity - 1, lastRefillMs: nowMs });
      return true;
    }
    const elapsedSeconds = Math.max(0, (nowMs - existing.lastRefillMs) / 1000);
    const refilled = Math.min(limit.capacity, existing.tokens + elapsedSeconds * limit.refillPerSecond);
    if (refilled < 1) {
      existing.tokens = refilled;
      existing.lastRefillMs = nowMs;
      return false;
    }
    existing.tokens = refilled - 1;
    existing.lastRefillMs = nowMs;
    return true;
  }

  /** Release all bucket state for a socket (call on disconnect). */
  forget(socketId: string): void {
    this.buckets.delete(socketId);
  }
}

const COMMAND_BUCKET: Partial<Record<string, RateLimitBucket>> = {
  MoveIntent: 'movement',
  CastReq: 'cast',
  ChatRequest: 'chat',
  LootPickup: 'inventory',
  UseItem: 'inventory',
  RequestInventory: 'inventory',
  EquipItem: 'equipment',
  UnequipItem: 'equipment',
  LearnSkill: 'lifecycle',
  RespawnRequest: 'lifecycle',
  SelectClass: 'identity',
  SelectRace: 'identity',
};

export function bucketForCommand(commandType: string): RateLimitBucket | null {
  return COMMAND_BUCKET[commandType] ?? null;
}

const sharedLimiter = new SocketRateLimiter();

/** Process-wide limiter shared by the world router. */
export function sharedRateLimiter(): SocketRateLimiter {
  return sharedLimiter;
}

/** Call on socket disconnect so per-socket bucket state doesn't leak. */
export function forgetSocketRateLimits(socketId: string): void {
  sharedLimiter.forget(socketId);
}
