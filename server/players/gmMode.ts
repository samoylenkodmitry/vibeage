/**
 * GM (Game Master) gate. Current test policy has three paths to GM:
 *
 *   1. Dev mode: `VIBEAGE_ENABLE_DEV_COMMANDS=1` (forbidden in
 *      production by productionEnvAssertions) — everybody is GM.
 *      Used in local dev + the playwright e2e harness.
 *
 *   2. Authenticated account: while the project is in active testing,
 *      every logged-in account can use GM tools.
 *
 *   3. Legacy allowlist: `VIBEAGE_GM_ACCOUNTS=alice,bob`
 *      enables GM for the listed account logins. Account ids and
 *      character names are also accepted as fallbacks for legacy
 *      sessions/tests, but login is the intended key.
 *
 * Pre-fix only path 1 existed, so GM was unreachable in production
 * (the prod assertions would refuse to start with the dev flag on).
 */
type GmPrincipal =
  | string
  | {
    accountLogin?: string | null;
    accountId?: string | null;
    name?: string | null;
  };

/**
 * True if dev mode is enabled, the caller is attached to an account,
 * or their legacy identifier is allowlisted.
 */
export function isGmAccount(
  caller: GmPrincipal | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.VIBEAGE_ENABLE_DEV_COMMANDS === '1') return true;
  if (hasAuthenticatedAccount(caller)) return true;
  const allow = parseGmAccounts(env);
  if (allow.length === 0) return false;
  const candidates = gmPrincipalCandidates(caller);
  return candidates.some((candidate) => allow.includes(candidate));
}

let lastRawGmAccounts: string | undefined;
let cachedGmAccounts: string[] = [];

function parseGmAccounts(env: NodeJS.ProcessEnv): string[] {
  const raw = env.VIBEAGE_GM_ACCOUNTS;
  if (!raw) {
    lastRawGmAccounts = raw;
    cachedGmAccounts = [];
    return cachedGmAccounts;
  }
  if (raw === lastRawGmAccounts) return cachedGmAccounts;
  lastRawGmAccounts = raw;
  cachedGmAccounts = raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0);
  return cachedGmAccounts;
}

function gmPrincipalCandidates(caller: GmPrincipal | null | undefined): string[] {
  if (!caller) return [];
  const raw = typeof caller === 'string'
    ? [caller]
    : [caller.accountLogin, caller.accountId, caller.name];
  return raw
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

function hasAuthenticatedAccount(caller: GmPrincipal | null | undefined): boolean {
  if (!caller || typeof caller === 'string') return false;
  return Boolean(normalized(caller.accountLogin) || normalized(caller.accountId));
}

function normalized(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}
