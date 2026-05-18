import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-signed session tokens carrying the account id. Format:
 *   `<accountId>.<expiryUnix>.<sigBase64Url>`
 * where sig = HMAC_SHA256(secret, `${accountId}.${expiryUnix}`).
 *
 * Verified server-side on the world join handshake and on each HTTP
 * api/account/* call. No DB session table — stateless tokens keep
 * the auth path simple.
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

export function isDevAuthSecret(): boolean {
  return !process.env.VIBEAGE_AUTH_SECRET;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function issueSessionToken(accountId: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const expiry = Date.now() + ttlMs;
  const payload = `${accountId}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string): { accountId: string } | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [accountId, expiryStr, sig] = parts;
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return null;
  const expected = sign(`${accountId}.${expiry}`);
  try {
    const a = Buffer.from(sig, 'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { accountId };
}
