import { describe, expect, it, vi } from 'vitest';
import {
  becomeCharacter,
  firstAllowedClass,
  isValidIdentityName,
} from '../apps/client/src/onboarding';

// In-world Awakening orchestration. The component is a thin shell; the real
// logic — validate → authenticate (register/login) → create character — lives
// here and is exercised against an injected fetch so no server/DB is needed.

type Reply = { status: number; body: unknown };

/**
 * Builds a fetch stub that dispatches by URL substring and records every call
 * so a test can assert what was posted (endpoint, method, auth header, body).
 */
function stubFetch(routes: Array<{ match: string; reply: Reply }>) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = [];
  const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const route = routes.find((r) => url.includes(r.match));
    const reply = route?.reply ?? { status: 404, body: {} };
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    } as Response;
  });
  return { fetchFn, calls };
}

const VALID = {
  login: 'arin',
  password: 'secret',
  name: 'Arin',
  race: 'elf' as const,
  className: 'ranger' as const,
};

describe('isValidIdentityName', () => {
  it('accepts 1–24 chars of [A-Za-z0-9._-]', () => {
    expect(isValidIdentityName('Arin')).toBe(true);
    expect(isValidIdentityName('a')).toBe(true);
    expect(isValidIdentityName('hero_99-x.y')).toBe(true);
  });
  it('rejects empty, spaces, too-long, and unicode', () => {
    expect(isValidIdentityName('   ')).toBe(false);
    expect(isValidIdentityName('two words')).toBe(false);
    expect(isValidIdentityName('a'.repeat(25))).toBe(false);
    expect(isValidIdentityName('naïve')).toBe(false);
  });
});

describe('firstAllowedClass', () => {
  it('returns a class the race actually allows', () => {
    // orc only permits warrior — the picker must never default to mage for it.
    expect(firstAllowedClass('orc')).toBe('warrior');
  });
});

describe('becomeCharacter', () => {
  it('registers/logs in then creates the character, returning the chosen identity', async () => {
    const { fetchFn, calls } = stubFetch([
      { match: '/api/auth', reply: { status: 200, body: { token: 'tok-123', login: 'arin' } } },
      { match: '/api/account/characters', reply: { status: 200, body: {} } },
    ]);

    const outcome = await becomeCharacter(VALID, fetchFn);

    expect(outcome.ok).toBe(true);
    expect(outcome.character).toEqual({ name: 'Arin', race: 'elf', className: 'ranger' });
    expect(outcome.session).toEqual({ token: 'tok-123', login: 'arin' });

    // Auth first, then a token-authenticated character create.
    expect(calls[0].url).toContain('/api/auth');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toEqual({ login: 'arin', password: 'secret' });
    expect(calls[1].url).toContain('/api/account/characters');
    expect(calls[1].method).toBe('POST');
    expect(calls[1].headers.authorization).toBe('Bearer tok-123');
    expect(calls[1].body).toEqual({ name: 'Arin', race: 'elf', className: 'ranger' });
  });

  it('fails at the validate stage on a bad name without touching the network', async () => {
    const { fetchFn, calls } = stubFetch([]);
    const outcome = await becomeCharacter({ ...VALID, name: 'bad name!' }, fetchFn);
    expect(outcome.ok).toBe(false);
    expect(outcome.stage).toBe('validate');
    expect(calls).toHaveLength(0);
  });

  it('fails at the validate stage when the prophecy is illegal for the race', async () => {
    const { fetchFn, calls } = stubFetch([]);
    // orc cannot be a mage.
    const outcome = await becomeCharacter({ ...VALID, race: 'orc', className: 'mage' }, fetchFn);
    expect(outcome.ok).toBe(false);
    expect(outcome.stage).toBe('validate');
    expect(calls).toHaveLength(0);
  });

  it('surfaces an auth failure (wrong password) without creating a character', async () => {
    const { fetchFn, calls } = stubFetch([
      { match: '/api/auth', reply: { status: 401, body: { error: 'wrongCredentials' } } },
    ]);
    const outcome = await becomeCharacter(VALID, fetchFn);
    expect(outcome.ok).toBe(false);
    expect(outcome.stage).toBe('auth');
    expect(outcome.error).toMatch(/wrong password/i);
    expect(calls).toHaveLength(1); // never reached the create call
  });

  it('surfaces a name-taken create failure after a good auth', async () => {
    const { fetchFn } = stubFetch([
      { match: '/api/auth', reply: { status: 200, body: { token: 'tok', login: 'arin' } } },
      { match: '/api/account/characters', reply: { status: 409, body: { error: 'nameTaken' } } },
    ]);
    const outcome = await becomeCharacter(VALID, fetchFn);
    expect(outcome.ok).toBe(false);
    expect(outcome.stage).toBe('create');
    expect(outcome.error).toMatch(/already have a hero/i);
  });
});
