import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-signed session tokens carrying the account id + issued-at.
 * Format:
 *   `<accountId>.<iatUnix>.<expiryUnix>.<sigBase64Url>`
 * where sig = HMAC_SHA256(secret, `${accountId}.${iatUnix}.${expiryUnix}`).
 *
 * Verified server-side on the world join handshake and on each HTTP
 * api/account/* call. The `iat` lets `POST /api/auth/logout` bump
 * `accounts.tokens_valid_after`; verifySessionToken consults an
 * in-process Map (loaded from DB at boot, updated on every logout)
 * and rejects tokens whose iat predates that timestamp.
 *
 * The Map is the authority during normal operation. After a server
 * restart, primeRevocationCache() rehydrates it from the accounts
 * table so logouts survive restarts.
 *
 * Migration 010 added the column; this file is the new format.
 * Existing tokens issued by the previous 3-segment format will fail
 * the parts-length check and be rejected — clients have to log in
 * again on the deploy that ships this.
 *
 * Secret comes from VIBEAGE_AUTH_SECRET (32+ bytes). For dev with
 * no env set, a fixed dev secret is used; production assertions
 * (server/productionEnvAssertions.ts) reject that path.
 */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEV_SECRET = 'vibeage-dev-auth-secret-do-not-use-in-prod';

function getSecret(): string {
  return process.env.VIBEAGE_AUTH_SECRET || DEV_SECRET;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

// Map<accountId, validAfterMs>. Populated at boot from the accounts
// table (see primeRevocationCache). Updated by `revokeTokensForAccount`
// when a logout endpoint hit returns.
const tokensValidAfter = new Map<string, number>();

export function primeRevocationCache(rows: ReadonlyArray<{ id: string; tokens_valid_after: Date | string | number }>): void {
  tokensValidAfter.clear();
  for (const row of rows) {
    const ms = row.tokens_valid_after instanceof Date
      ? row.tokens_valid_after.getTime()
      : new Date(row.tokens_valid_after).getTime();
    if (Number.isFinite(ms) && ms > 0) {
      tokensValidAfter.set(row.id, ms);
    }
  }
}

export function revokeTokensForAccount(accountId: string, atMs: number = Date.now()): void {
  tokensValidAfter.set(accountId, atMs);
}

export function issueSessionToken(accountId: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const iat = Date.now();
  const expiry = iat + ttlMs;
  const payload = `${accountId}.${iat}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string): { accountId: string; iat: number } | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [accountId, iatStr, expiryStr, sig] = parts;
  const iat = Number(iatStr);
  const expiry = Number(expiryStr);
  if (!Number.isFinite(iat) || !Number.isFinite(expiry) || expiry < Date.now()) return null;
  const expected = sign(`${accountId}.${iat}.${expiry}`);
  try {
    const a = Buffer.from(sig, 'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  const validAfter = tokensValidAfter.get(accountId) ?? 0;
  if (iat < validAfter) return null;
  return { accountId, iat };
}

// Test-only — lets specs reset cache state between scenarios.
export function _resetRevocationCacheForTests(): void {
  tokensValidAfter.clear();
}
