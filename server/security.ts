import type { IncomingHttpHeaders } from 'node:http';

export const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://vibeage.eu',
];

const DEFAULT_MAX_HTTP_BUFFER_SIZE = 1024 * 1024;
const HARD_MAX_HTTP_BUFFER_SIZE = 4 * 1024 * 1024;

export function parseAllowedOrigins(
  rawOrigins: string | undefined,
  defaultOrigins: readonly string[] = DEFAULT_CORS_ORIGINS,
): string[] {
  const origins = rawOrigins
    ?.split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin)) ?? [];

  return origins.length > 0 ? origins : [...defaultOrigins];
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
  allowMissingOrigin = false,
): boolean {
  if (!origin) {
    return allowMissingOrigin;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  return normalizedOrigin !== undefined && allowedOrigins.includes(normalizedOrigin);
}

export function parseMaxHttpBufferSize(rawValue: string | undefined): number {
  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_MAX_HTTP_BUFFER_SIZE;
  }

  return Math.min(parsed, HARD_MAX_HTTP_BUFFER_SIZE);
}

export function getClientIp(headers: IncomingHttpHeaders, remoteAddress?: string): string {
  if (!remoteAddress || !isLoopbackAddress(remoteAddress)) {
    return remoteAddress ?? 'unknown';
  }

  const forwardedFor = firstHeaderValue(headers['x-forwarded-for']);
  const forwardedIp = forwardedFor?.split(',')[0]?.trim();
  return forwardedIp || remoteAddress;
}

function normalizeOrigin(origin: string): string | undefined {
  const trimmed = origin.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return undefined;
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isLoopbackAddress(address: string): boolean {
  return address === '::1'
    || address === '127.0.0.1'
    || address.startsWith('127.')
    || address.startsWith('::ffff:127.');
}
