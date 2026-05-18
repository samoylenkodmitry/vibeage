import { describe, expect, it } from 'vitest';
import { validateCredentials } from '../server/auth/accountRepository';

describe('validateCredentials', () => {
  it('accepts a single-character login + password', () => {
    expect(validateCredentials('a', 'a')).toBeNull();
  });
  it('accepts mixed-case alphanumerics with dots / underscores / dashes', () => {
    expect(validateCredentials('My_login.1-2', 'secret_pass.1')).toBeNull();
  });
  it('rejects an empty login', () => {
    expect(validateCredentials('', 'something')).toBe('invalidLogin');
  });
  it('rejects an empty password', () => {
    expect(validateCredentials('login', '')).toBe('invalidPassword');
  });
  it('rejects a login containing spaces / unicode', () => {
    expect(validateCredentials('with space', 'p')).toBe('invalidLogin');
    expect(validateCredentials('я', 'p')).toBe('invalidLogin');
  });
  it('rejects logins longer than 24 chars', () => {
    expect(validateCredentials('a'.repeat(25), 'p')).toBe('invalidLogin');
  });
  it('rejects passwords longer than 128 chars', () => {
    expect(validateCredentials('login', 'x'.repeat(129))).toBe('invalidPassword');
  });
});
