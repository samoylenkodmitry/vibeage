import { describe, it, expect } from 'vitest';
import {
  SocketRateLimiter,
  bucketForCommand,
  forgetSocketRateLimits,
  sharedRateLimiter,
  RATE_LIMITS,
} from '../server/world/rateLimiter.js';

describe('SocketRateLimiter', () => {
  it('allows up to capacity actions before throttling within the same instant', () => {
    const limiter = new SocketRateLimiter();
    const t0 = 1_000_000;
    const cap = RATE_LIMITS.cast.capacity;

    for (let i = 0; i < cap; i++) {
      expect(limiter.allow('socket-a', 'cast', t0)).toBe(true);
    }
    expect(limiter.allow('socket-a', 'cast', t0)).toBe(false);
  });

  it('refills tokens over time at the configured rate', () => {
    const limiter = new SocketRateLimiter();
    const t0 = 1_000_000;
    const cap = RATE_LIMITS.chat.capacity;
    const refillPerSec = RATE_LIMITS.chat.refillPerSecond;

    for (let i = 0; i < cap; i++) {
      expect(limiter.allow('socket-b', 'chat', t0)).toBe(true);
    }
    expect(limiter.allow('socket-b', 'chat', t0)).toBe(false);

    const waitMs = Math.ceil(1000 / refillPerSec) + 5;
    expect(limiter.allow('socket-b', 'chat', t0 + waitMs)).toBe(true);
  });

  it('does not refill past capacity', () => {
    const limiter = new SocketRateLimiter();
    const t0 = 1_000_000;
    const cap = RATE_LIMITS.movement.capacity;

    expect(limiter.allow('socket-c', 'movement', t0)).toBe(true);
    const farFuture = t0 + 60 * 60 * 1000;
    for (let i = 0; i < cap; i++) {
      expect(limiter.allow('socket-c', 'movement', farFuture + i)).toBe(true);
    }
    expect(limiter.allow('socket-c', 'movement', farFuture + cap)).toBe(false);
  });

  it('tracks buckets independently per socket', () => {
    const limiter = new SocketRateLimiter();
    const t0 = 1_000_000;
    const cap = RATE_LIMITS.cast.capacity;

    for (let i = 0; i < cap; i++) {
      limiter.allow('socket-a', 'cast', t0);
    }
    expect(limiter.allow('socket-a', 'cast', t0)).toBe(false);
    expect(limiter.allow('socket-b', 'cast', t0)).toBe(true);
  });

  it('rejects on first call when capacity is configured below 1', () => {
    const limiter = new SocketRateLimiter({
      ...RATE_LIMITS,
      chat: { capacity: 0.5, refillPerSecond: 1 },
    });
    expect(limiter.allow('socket-z', 'chat', 1_000_000)).toBe(false);
  });

  it('forget clears all per-socket state so the next action gets a full bucket', () => {
    const limiter = new SocketRateLimiter();
    const t0 = 1_000_000;
    const cap = RATE_LIMITS.cast.capacity;

    for (let i = 0; i < cap; i++) {
      limiter.allow('socket-a', 'cast', t0);
    }
    expect(limiter.allow('socket-a', 'cast', t0)).toBe(false);

    limiter.forget('socket-a');
    expect(limiter.allow('socket-a', 'cast', t0)).toBe(true);
  });
});

describe('bucketForCommand', () => {
  it('maps known client commands to their buckets', () => {
    expect(bucketForCommand('MoveIntent')).toBe('movement');
    expect(bucketForCommand('CastReq')).toBe('cast');
    expect(bucketForCommand('ChatRequest')).toBe('chat');
    expect(bucketForCommand('EquipItem')).toBe('equipment');
    expect(bucketForCommand('UnequipItem')).toBe('equipment');
    expect(bucketForCommand('UseItem')).toBe('inventory');
    expect(bucketForCommand('LearnSkill')).toBe('lifecycle');
    expect(bucketForCommand('SelectRace')).toBe('identity');
    expect(bucketForCommand('SelectClass')).toBe('identity');
  });

  it('returns null for unmapped command types', () => {
    expect(bucketForCommand('UnknownCommand')).toBeNull();
  });
});

describe('shared limiter helpers', () => {
  it('forgetSocketRateLimits releases shared state for that socket', () => {
    const limiter = sharedRateLimiter();
    const t0 = 2_000_000;
    const cap = RATE_LIMITS.cast.capacity;

    for (let i = 0; i < cap; i++) {
      limiter.allow('shared-socket', 'cast', t0);
    }
    expect(limiter.allow('shared-socket', 'cast', t0)).toBe(false);

    forgetSocketRateLimits('shared-socket');
    expect(limiter.allow('shared-socket', 'cast', t0)).toBe(true);

    forgetSocketRateLimits('shared-socket');
  });
});
