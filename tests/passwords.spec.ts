import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../server/auth/passwords';

describe('password hashing', () => {
  it('verifyPassword accepts the password it was hashed from', async () => {
    const { hash, salt } = await hashPassword('hunter2');
    expect(await verifyPassword('hunter2', hash, salt)).toBe(true);
  });
  it('verifyPassword rejects a wrong password', async () => {
    const { hash, salt } = await hashPassword('hunter2');
    expect(await verifyPassword('wrong', hash, salt)).toBe(false);
  });
  it('verifyPassword rejects a malformed hash without throwing', async () => {
    expect(await verifyPassword('hunter2', 'not-base64', 'not-base64')).toBe(false);
  });
});
