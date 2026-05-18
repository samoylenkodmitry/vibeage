import { createHmac } from 'node:crypto';

/**
 * Mints a session token compatible with server/auth/sessionTokens.ts
 * so CI harnesses (perf smoke, Playwright e2e) can join the world
 * without going through the /api/auth HTTP flow + a real Postgres.
 *
 * Format: `${accountId}.${expiryUnix}.${hmacBase64Url}`
 */
export function mintCiSessionToken({ secret, accountId, ttlMs = 60 * 60 * 1000 }) {
  if (!secret || secret.length < 32) {
    throw new Error('mintCiSessionToken: secret must be 32+ bytes');
  }
  const expiry = Date.now() + ttlMs;
  const payload = `${accountId}.${expiry}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

// Fixed CI secret. Production assertions only run under NODE_ENV=production;
// CI never sets that, so this value is only ever used for self-issued tokens
// against a transient (no-Postgres) server. Low-entropy on purpose so
// gitleaks doesn't flag it as a real credential.
export const CI_AUTH_SECRET = 'x'.repeat(40);
