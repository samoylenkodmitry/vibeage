/**
 * GM (Game Master) gate. Two paths to GM:
 *
 *   1. Dev mode: `VIBEAGE_ENABLE_DEV_COMMANDS=1` (forbidden in
 *      production by productionEnvAssertions) — everybody is GM.
 *      Used in local dev + the playwright e2e harness.
 *
 *   2. Production-safe path: `VIBEAGE_GM_ACCOUNTS=alice,bob`
 *      enables GM for the listed player names only. Safe to set
 *      in production because the account name is checked per-call
 *      in `isGmAccount`. Other players still hit the deny path
 *      and get a CommandRejected.
 *
 * Pre-fix only path 1 existed, so GM was unreachable in production
 * (the prod assertions would refuse to start with the dev flag on).
 */
export function isGmModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VIBEAGE_ENABLE_DEV_COMMANDS === '1') return true;
  return parseGmAccounts(env).length > 0;
}

/**
 * True if the caller's player name is on the GM allowlist, OR
 * dev-commands mode is on (in which case everyone is GM).
 */
export function isGmAccount(
  callerName: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.VIBEAGE_ENABLE_DEV_COMMANDS === '1') return true;
  if (!callerName) return false;
  const allow = parseGmAccounts(env);
  if (allow.length === 0) return false;
  return allow.includes(callerName.trim().toLowerCase());
}

function parseGmAccounts(env: NodeJS.ProcessEnv): string[] {
  const raw = env.VIBEAGE_GM_ACCOUNTS;
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0);
}
