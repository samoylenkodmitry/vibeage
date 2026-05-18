import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing via node:crypto.scrypt — no new dependency.
 * Format stored in the DB:
 *   password_salt: 16 random bytes, base64-url
 *   password_hash: 32 bytes scrypt(N=16384,r=8,p=1) of (password || salt), base64-url
 *
 * verifyPassword uses timingSafeEqual so attackers can't tell from a
 * timing side-channel whether the login row exists or just the hash
 * mismatched.
 */
// promisified scrypt with the 5-arg (password, salt, keylen, options,
// callback) overload — the TS types only expose the 4-arg overload by
// default, so we wrap manually instead of using promisify().
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

function scrypt(password: string | Buffer, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, SCRYPT_OPTS, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_BYTES);
  return { hash: derived.toString('base64url'), salt: salt.toString('base64url') };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
): Promise<boolean> {
  try {
    const salt = Buffer.from(storedSalt, 'base64url');
    const expected = Buffer.from(storedHash, 'base64url');
    if (expected.length !== KEY_BYTES) return false;
    const derived = await scrypt(password, salt, KEY_BYTES);
    return timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}
