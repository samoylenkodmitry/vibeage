import { describe, expect, it } from 'vitest';
import { CI_AUTH_SECRET, mintCiSessionToken } from '../scripts/ci-session-token.mjs';
import { verifySessionToken } from '../server/auth/sessionTokens';

const REAL_PROD_SECRET = 'x'.repeat(40); // same as CI_AUTH_SECRET; pin shape

describe('mintCiSessionToken matches verifySessionToken (server)', () => {
  it('emits a 4-segment token the server accepts', () => {
    process.env.VIBEAGE_AUTH_SECRET = CI_AUTH_SECRET;
    const token = mintCiSessionToken({
      secret: CI_AUTH_SECRET,
      accountId: 'ci-acct-1',
    });

    // Format guard: <accountId>.<iat>.<expiry>.<sig> — verifySessionToken
    // requires `parts.length === 4`. Older 3-segment tokens silently
    // rejected and the perf smoke showed "missing or invalid session
    // token" with no other signal.
    expect(token.split('.')).toHaveLength(4);

    const verified = verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.accountId).toBe('ci-acct-1');
  });

  it('exposes accountId.iat.expiry.sig segments in that order', () => {
    const token = mintCiSessionToken({
      secret: CI_AUTH_SECRET,
      accountId: 'ci-acct-2',
    });
    const [accountId, iatStr, expiryStr, sig] = token.split('.');
    expect(accountId).toBe('ci-acct-2');
    expect(Number(iatStr)).toBeGreaterThan(0);
    expect(Number(expiryStr)).toBeGreaterThan(Number(iatStr));
    expect(sig.length).toBeGreaterThan(0);
  });

  it('uses the same secret bytes as CI_AUTH_SECRET to align with the server', () => {
    expect(CI_AUTH_SECRET).toBe(REAL_PROD_SECRET);
  });
});
