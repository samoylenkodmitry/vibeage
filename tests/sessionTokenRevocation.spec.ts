import { afterEach, describe, expect, test } from 'vitest';
import {
  _resetRevocationCacheForTests,
  issueSessionToken,
  primeRevocationCache,
  revokeTokensForAccount,
  verifySessionToken,
} from '../server/auth/sessionTokens';

// Migration 010 — every logout bumps `accounts.tokens_valid_after`
// and the in-process Map. Tokens issued before that moment must fail
// `verifySessionToken`. Newly issued tokens (post-logout) must pass.

afterEach(() => _resetRevocationCacheForTests());

describe('session token revocation', () => {
  test('fresh token verifies against an empty cache', () => {
    const token = issueSessionToken('acc-1');
    expect(verifySessionToken(token)?.accountId).toBe('acc-1');
  });

  test('revoking the account invalidates pre-revocation tokens', async () => {
    const oldToken = issueSessionToken('acc-1');
    // Wait a hair so the post-revoke iat is strictly greater.
    await new Promise((r) => setTimeout(r, 5));
    revokeTokensForAccount('acc-1');
    expect(verifySessionToken(oldToken)).toBeNull();
  });

  test('tokens issued after the revocation pass', async () => {
    revokeTokensForAccount('acc-1');
    await new Promise((r) => setTimeout(r, 5));
    const freshToken = issueSessionToken('acc-1');
    expect(verifySessionToken(freshToken)?.accountId).toBe('acc-1');
  });

  test('revocation is scoped to one account', async () => {
    const aToken = issueSessionToken('acc-a');
    const bToken = issueSessionToken('acc-b');
    await new Promise((r) => setTimeout(r, 5));
    revokeTokensForAccount('acc-a');
    expect(verifySessionToken(aToken)).toBeNull();
    expect(verifySessionToken(bToken)?.accountId).toBe('acc-b');
  });

  test('primeRevocationCache rehydrates from a DB snapshot at boot', async () => {
    const oldToken = issueSessionToken('acc-1');
    await new Promise((r) => setTimeout(r, 5));
    // Simulate the row that survived a restart.
    primeRevocationCache([
      { id: 'acc-1', tokens_valid_after: new Date() },
    ]);
    expect(verifySessionToken(oldToken)).toBeNull();
  });

  test('legacy 3-segment tokens are rejected (post-format-change)', () => {
    // Old format: <accountId>.<expiry>.<sig>. Anything that splits
    // into 3 parts is rejected by the new verifier.
    const legacy = 'acc-1.99999999999999.bogussig';
    expect(verifySessionToken(legacy)).toBeNull();
  });
});
