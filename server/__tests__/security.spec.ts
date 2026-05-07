import { describe, expect, it } from 'vitest';
import {
  getClientIp,
  isOriginAllowed,
  parseAllowedOrigins,
  parseMaxHttpBufferSize,
} from '../security.js';

describe('server security helpers', () => {
  it('normalizes configured CORS origins', () => {
    expect(parseAllowedOrigins(' https://vibeage.eu/path , not-a-url, http://localhost:3000 ')).toEqual([
      'https://vibeage.eu',
      'http://localhost:3000',
    ]);
  });

  it('rejects missing and unlisted socket origins by default', () => {
    const origins = ['https://vibeage.eu'];

    expect(isOriginAllowed(undefined, origins)).toBe(false);
    expect(isOriginAllowed('https://evil.example', origins)).toBe(false);
    expect(isOriginAllowed('https://vibeage.eu/game', origins)).toBe(true);
  });

  it('caps socket payload buffers to a small production ceiling', () => {
    expect(parseMaxHttpBufferSize(undefined)).toBe(1024 * 1024);
    expect(parseMaxHttpBufferSize('8192')).toBe(8192);
    expect(parseMaxHttpBufferSize('999999999')).toBe(4 * 1024 * 1024);
    expect(parseMaxHttpBufferSize('nope')).toBe(1024 * 1024);
  });

  it('uses forwarded client IPs only behind a local reverse proxy', () => {
    expect(getClientIp({ 'x-forwarded-for': '203.0.113.10, 10.0.0.2' }, '127.0.0.1')).toBe('203.0.113.10');
    expect(getClientIp({ 'x-forwarded-for': '203.0.113.10' }, '198.51.100.20')).toBe('198.51.100.20');
  });
});
