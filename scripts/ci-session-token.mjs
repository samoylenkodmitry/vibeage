import { createHmac } from 'node:crypto';

/**
 * Mints a session token compatible with server/auth/sessionTokens.ts
 * so CI harnesses (perf smoke, Playwright e2e) can join the world
 * without going through the /api/auth HTTP flow + a real Postgres.
 *
 * Format: `${accountId}.${iatUnix}.${expiryUnix}.${hmacBase64Url}`
 *
 * Note: Migration 010 added the `iat` segment so logout can bump
 * `accounts.tokens_valid_after` and invalidate older tokens. CI
 * tokens that omitted `iat` (the original 3-segment shape) fail
 * the 4-parts check in `verifySessionToken` and the perf smoke
 * shows "Rejected join: missing or invalid session token".
 */
export function mintCiSessionToken({ secret, accountId, ttlMs = 60 * 60 * 1000 }) {
  if (!secret || secret.length < 32) {
    throw new Error('mintCiSessionToken: secret must be 32+ bytes');
  }
  const iat = Date.now();
  const expiry = iat + ttlMs;
  const payload = `${accountId}.${iat}.${expiry}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

// Fixed CI secret. Production assertions only run under NODE_ENV=production;
// CI never sets that, so this value is only ever used for self-issued tokens
// against a transient (no-Postgres) server. Low-entropy on purpose so
// gitleaks doesn't flag it as a real credential.
export const CI_AUTH_SECRET = 'x'.repeat(40);
