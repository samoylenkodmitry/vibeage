import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { issueSessionToken, verifySessionToken } from '../server/auth/sessionTokens';

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
