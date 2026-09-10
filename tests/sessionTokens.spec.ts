import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken, shouldRenewSessionToken, verifySessionToken } from '../server/auth/sessionTokens';

// Synthetic strings used purely as scrypt/hmac inputs. Kept low-
// entropy + repeating so secret scanners don't flag them, since
// they're not credentials anywhere outside this test file.
const FIXTURE_SECRET_A = 'x'.repeat(40);
const FIXTURE_SECRET_B = 'y'.repeat(40);

describe('session tokens', () => {
  beforeEach(() => {
    process.env.VIBEAGE_AUTH_SECRET = FIXTURE_SECRET_A;
  });
  afterEach(() => {
    delete process.env.VIBEAGE_AUTH_SECRET;
  });

  it('issues a verifiable token for an account id', () => {
    const token = issueSessionToken('acct-1');
    expect(verifySessionToken(token)?.accountId).toBe('acct-1');
  });
  it('rejects a token signed with a different secret', () => {
    const token = issueSessionToken('acct-2');
    process.env.VIBEAGE_AUTH_SECRET = FIXTURE_SECRET_B;
    expect(verifySessionToken(token)).toBeNull();
  });
  it('rejects an expired token', () => {
    const token = issueSessionToken('acct-3', -1);
    expect(verifySessionToken(token)).toBeNull();
  });
  it('rejects a tampered token', () => {
    const token = issueSessionToken('acct-4');
    const parts = token.split('.');
    parts[0] = 'attacker';
    expect(verifySessionToken(parts.join('.'))).toBeNull();
  });
  it('rejects a malformed token', () => {
    expect(verifySessionToken('not.a.token.too.many.parts')).toBeNull();
    expect(verifySessionToken('only-one-piece')).toBeNull();
    expect(verifySessionToken('')).toBeNull();
  });
});

/**
 * Sliding sessions. A token that expires costs the player their hero: the next
 * world join is rejected and they land as the Nameless guest until they log in
 * again. Renewing on join keeps that fate for accounts that stop visiting, not
 * for the ones that keep playing.
 */
describe('shouldRenewSessionToken', () => {
  const HOUR = 60 * 60 * 1000;
  const now = 1_700_000_000_000;

  it('leaves a freshly-issued token alone (no pointless re-mint every join)', () => {
    expect(shouldRenewSessionToken(now, now)).toBe(false);
    expect(shouldRenewSessionToken(now - HOUR, now)).toBe(false);
    expect(shouldRenewSessionToken(now - 23 * HOUR, now)).toBe(false);
  });

  it('renews once the token is a day old, and for anything older', () => {
    expect(shouldRenewSessionToken(now - 24 * HOUR, now)).toBe(true);
    expect(shouldRenewSessionToken(now - 29 * 24 * HOUR, now)).toBe(true);
  });

  it('never renews on a nonsense issued-at', () => {
    expect(shouldRenewSessionToken(Number.NaN, now)).toBe(false);
  });

  it('a renewal is itself a valid token for the same account', () => {
    process.env.VIBEAGE_AUTH_SECRET = FIXTURE_SECRET_A;
    const renewed = issueSessionToken('acct-renew');
    expect(verifySessionToken(renewed)?.accountId).toBe('acct-renew');
    delete process.env.VIBEAGE_AUTH_SECRET;
  });
});
