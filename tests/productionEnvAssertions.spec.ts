import { describe, expect, it } from 'vitest';
import {
  findProductionEnvViolations,
  assertProductionEnv,
  isProductionEnv,
} from '../server/productionEnvAssertions.js';

const baseProdEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  CORS_ORIGINS: 'https://example.com',
  RUNTIMEZ_TOKEN: 'secret-token',
  VIBEAGE_AUTH_SECRET: 'long-enough-secret-32-bytes-or-more-12345',
});

describe('isProductionEnv', () => {
  it('is true only when NODE_ENV === production', () => {
    expect(isProductionEnv({ NODE_ENV: 'production' })).toBe(true);
    expect(isProductionEnv({ NODE_ENV: 'development' })).toBe(false);
    expect(isProductionEnv({})).toBe(false);
  });
});

describe('findProductionEnvViolations', () => {
  it('returns no violations in non-production envs even when flags are set', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'development',
      ALLOW_MISSING_ORIGIN: '1',
      VIBEAGE_ENABLE_DEV_COMMANDS: '1',
    };
    expect(findProductionEnvViolations(env)).toEqual([]);
  });

  it('flags ALLOW_MISSING_ORIGIN=1 in production', () => {
    const env = { ...baseProdEnv(), ALLOW_MISSING_ORIGIN: '1' };
    const violations = findProductionEnvViolations(env);
    expect(violations.map(v => v.variable)).toContain('ALLOW_MISSING_ORIGIN');
  });

  it('flags VIBEAGE_ENABLE_DEV_COMMANDS=1 in production', () => {
    const env = { ...baseProdEnv(), VIBEAGE_ENABLE_DEV_COMMANDS: '1' };
    const violations = findProductionEnvViolations(env);
    expect(violations.map(v => v.variable)).toContain('VIBEAGE_ENABLE_DEV_COMMANDS');
  });

  it('flags missing CORS_ORIGINS in production', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
    const violations = findProductionEnvViolations(env);
    expect(violations.map(v => v.variable)).toContain('CORS_ORIGINS');
  });

  it('returns no violations when prod is configured safely', () => {
    expect(findProductionEnvViolations(baseProdEnv())).toEqual([]);
  });

  it('flags missing RUNTIMEZ_TOKEN in production without RUNTIMEZ_DISABLE', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://example.com',
    };
    const violations = findProductionEnvViolations(env);
    expect(violations.map(v => v.variable)).toContain('RUNTIMEZ_TOKEN');
  });

  it('accepts production with RUNTIMEZ_DISABLE=1 instead of a token', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://example.com',
      RUNTIMEZ_DISABLE: '1',
      VIBEAGE_AUTH_SECRET: 'long-enough-secret-32-bytes-or-more-12345',
    };
    expect(findProductionEnvViolations(env)).toEqual([]);
  });

  it('flags missing VIBEAGE_AUTH_SECRET in production', () => {
    const env = { ...baseProdEnv() };
    delete env.VIBEAGE_AUTH_SECRET;
    expect(findProductionEnvViolations(env).map(v => v.variable)).toContain('VIBEAGE_AUTH_SECRET');
  });

  it('flags a too-short VIBEAGE_AUTH_SECRET in production', () => {
    const env = { ...baseProdEnv(), VIBEAGE_AUTH_SECRET: 'short' };
    expect(findProductionEnvViolations(env).map(v => v.variable)).toContain('VIBEAGE_AUTH_SECRET');
  });
});

describe('assertProductionEnv', () => {
  it('throws when there are violations', () => {
    expect(() => assertProductionEnv({
      ...baseProdEnv(),
      ALLOW_MISSING_ORIGIN: '1',
    })).toThrow(/Refusing to start/);
  });

  it('does not throw in a clean production env', () => {
    expect(() => assertProductionEnv(baseProdEnv())).not.toThrow();
  });

  it('does not throw in development even with dev flags set', () => {
    expect(() => assertProductionEnv({
      NODE_ENV: 'development',
      ALLOW_MISSING_ORIGIN: '1',
      VIBEAGE_ENABLE_DEV_COMMANDS: '1',
    })).not.toThrow();
  });
});
