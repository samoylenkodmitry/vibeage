/**
 * Hard-fail guardrails for production deploys.
 *
 * These checks run once at server startup and abort the process if a known
 * unsafe combination of environment variables is detected. The intent is to
 * make it impossible to deploy with a dev escape hatch left on by accident.
 */

export type ProductionEnvViolation = {
  variable: string;
  message: string;
};

export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production';
}

export function findProductionEnvViolations(
  env: NodeJS.ProcessEnv = process.env,
): ProductionEnvViolation[] {
  if (!isProductionEnv(env)) return [];

  const violations: ProductionEnvViolation[] = [];

  if (env.ALLOW_MISSING_ORIGIN === '1') {
    violations.push({
      variable: 'ALLOW_MISSING_ORIGIN',
      message: 'ALLOW_MISSING_ORIGIN=1 is forbidden in production — it disables the WS origin check, allowing any non-browser client to connect.',
    });
  }

  if (env.VIBEAGE_ENABLE_DEV_COMMANDS === '1') {
    violations.push({
      variable: 'VIBEAGE_ENABLE_DEV_COMMANDS',
      message: 'VIBEAGE_ENABLE_DEV_COMMANDS=1 is forbidden in production — it enables /teleport and other debug commands for every connected client. Use authenticated account GM access or VIBEAGE_GM_ACCOUNTS for GM tools instead.',
    });
  }

  if (!env.CORS_ORIGINS || env.CORS_ORIGINS.trim() === '') {
    violations.push({
      variable: 'CORS_ORIGINS',
      message: 'CORS_ORIGINS must be set in production to an explicit allowlist (defaults are dev-only).',
    });
  }

  // VIBEAGE_AUTH_SECRET signs every session token (server/auth/sessionTokens.ts).
  // Without it, the server falls back to a public dev secret an attacker could
  // forge tokens against. Require it explicitly in production.
  if (!env.VIBEAGE_AUTH_SECRET || env.VIBEAGE_AUTH_SECRET.length < 32) {
    violations.push({
      variable: 'VIBEAGE_AUTH_SECRET',
      message: 'VIBEAGE_AUTH_SECRET must be set to a 32+ byte secret in production. Auth session tokens are signed with this; without it the server uses a public dev fallback that anyone could forge against.',
    });
  }

  // /runtimez is the live metrics endpoint. In production we require either
  // RUNTIMEZ_TOKEN (caller must present x-runtimez-token) or an explicit
  // RUNTIMEZ_DISABLE=1 to acknowledge the operator deliberately turned it off.
  // Defaulting to silent-404-in-prod (the old behaviour) hid metrics with no
  // breadcrumb; require an explicit decision instead.
  if (!env.RUNTIMEZ_TOKEN && env.RUNTIMEZ_DISABLE !== '1') {
    violations.push({
      variable: 'RUNTIMEZ_TOKEN',
      message: 'RUNTIMEZ_TOKEN must be set in production so the metrics endpoint is reachable to operators, or set RUNTIMEZ_DISABLE=1 to acknowledge it is intentionally off.',
    });
  }

  return violations;
}

export function assertProductionEnv(env: NodeJS.ProcessEnv = process.env): void {
  const violations = findProductionEnvViolations(env);
  if (violations.length === 0) return;

  for (const violation of violations) {
    console.error(`[FATAL] production env check failed for ${violation.variable}: ${violation.message}`);
  }
  throw new Error(
    `Refusing to start: ${violations.length} production environment guardrail violation(s). See log lines above.`,
  );
}
