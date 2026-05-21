import { describe, expect, it, beforeEach } from 'vitest';
import { nextClientSeq, _resetClientSeqForTests } from '../apps/client/src/commandSeq';

/**
 * §4 / §52 — `nextClientSeq` produces the monotonic per-command id the
 * client stamps on every rejectable command so `CommandRejected.requestId`
 * routes back to a specific request without overloading `clientTs`.
 */
describe('commandSeq', () => {
  beforeEach(() => {
    _resetClientSeqForTests();
  });

  it('starts at 1 (0 reserved as unset sentinel)', () => {
    expect(nextClientSeq()).toBe(1);
  });

  it('strictly monotonic — every call returns a fresh higher integer', () => {
    const seqs = Array.from({ length: 6 }, () => nextClientSeq());
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
  });

  it('test reset rewinds the counter', () => {
    nextClientSeq();
    nextClientSeq();
    nextClientSeq();
    _resetClientSeqForTests();
    expect(nextClientSeq()).toBe(1);
  });
});
