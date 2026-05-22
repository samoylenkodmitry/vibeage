# Security Review Checklist

Run through this list before any production deploy that touches
auth, persistence, the network boundary, or the production environment
script. Most items are already enforced by the CI gates / production
env assertions — this list is the human-readable index.

## Network Boundary

- [ ] Every new client message has a Zod schema in
  `packages/protocol/clientMessages.ts` and a TypeScript union
  entry. `tests/protocolTypeDrift.spec.ts` will fail if the two
  drift.
- [ ] Every new server message is classified as public, region-scoped,
  or owner-only in `docs/PROTOCOL.md`. Owner-only messages must be
  in `OWNER_ONLY_SERVER_MESSAGE_TYPES` (colyseusRoomAdapter.ts).
- [ ] Per-player data only flows through DTOs sanitised by
  `sanitizePlayerForPublic` / `sanitizePlayerForOwner`. Adding a
  new field to `PlayerState` defaults to private; opt in by editing
  `PUBLIC_PLAYER_FIELDS` / `OWNER_PLAYER_FIELDS`.

## Rate Limits + Suspicious Activity

- [ ] User-intent commands route through the per-socket
  `sharedRateLimiter` (`server/world/clientMessageRouter.ts`).
- [ ] Movement / cast / loot intents stay silent on rate-limit drop
  (high-frequency); other rejections emit `CommandRejected`.
- [ ] Ownership checks (`socketId === player.socketId`) fire before
  any state mutation; mismatch increments
  `clientMessages.invalidOwnership.*` and writes a durable
  `ownership.suspicious` `server_events` row via `authAudit.ts`.

## CSRF Policy

The pre-game HTTP API (`/api/auth/*`, `/api/account/*`) is
deliberately CSRF-safe by construction rather than by middleware:

- **Bearer-token auth, not cookies.** Tokens are HMAC-signed and
  carried in the `Authorization: Bearer …` header (`authRoutes.ts`).
  Browsers do NOT auto-attach Authorization headers to cross-origin
  requests, so a malicious site cannot use the player's existing
  session against `/api/account/*`.
- **No CORS allow-all on Express.** Any cross-origin request to a
  mutating endpoint triggers a preflight; without a server-side CORS
  permissive response, the preflight fails and the actual request
  never fires.
- **No state-changing GETs.** All mutations are POST/DELETE. The
  combination of "no cookies" + "no GET mutations" closes the
  classic CSRF surface.

Do not introduce cookie-based session auth or `Access-Control-Allow-Origin: *`
without revisiting this section.

## Auth + Secrets

- [ ] `VIBEAGE_AUTH_SECRET` is set to a 32+ byte secret in production
  (`productionEnvAssertions.ts` hard-fails otherwise).
- [ ] No `.env` / `credentials.json` / token / DB URL in the staged
  diff — `gitleaks` runs in CI as a safety net.
- [ ] Account session tokens are HMAC-signed and verified per
  request; no DB session table.
- [ ] Logout / ban revokes session via `tokens_valid_after`
  (migration 010) and the in-process revocation cache.

## Origins + CORS

- [ ] `CORS_ORIGINS` is set to an explicit production allowlist
  (defaults are dev-only; `productionEnvAssertions.ts` hard-fails
  if empty).
- [ ] `ALLOW_MISSING_ORIGIN=1` is forbidden in production.
- [ ] WebSocket `verifyClient` applies `isOriginAllowed` before any
  upgrade.

## Dev Escape Hatches

- [ ] `VIBEAGE_ENABLE_DEV_COMMANDS=1` is forbidden in production
  (`productionEnvAssertions.ts`).
- [ ] `/runtimez` requires `RUNTIMEZ_TOKEN` or is set to
  `RUNTIMEZ_DISABLE=1` in production (default-silent is forbidden;
  explicit decision required).
- [ ] No `console.log` of session tokens, account passwords, or
  raw player JSON.

## Persistence

- [ ] Schema migrations land in `scripts/migrations/<N>_<name>.sql`
  with an idempotent statement.
- [ ] `scripts/check-restored-postgres-compatibility.sql` pins any
  new required column.
- [ ] No persistence path bypasses `playerRepository` (so the
  privacy / column allowlist stays a single seam).

## Process + Container

- [ ] Single `unhandledRejection` handler that logs + `process.exit(1)`
  so async failures restart the container; `uncaughtException` stays
  log-only by deliberate asymmetry (a single bad sync tick handler
  shouldn't kill the world).
- [ ] No new SIGTERM handler that races with `db.ts`'s db-close.
- [ ] Container does not run as root (verify with `docker inspect`).

## Deploy Mechanics

- [ ] Deploy only from the local owner machine via
  `pnpm run deploy:production`. No GitHub-hosted SSH unless the
  owner explicitly approves it.
- [ ] Health check (`pnpm run health:production`) reports the new
  commit SHA after deploy.
- [ ] Smoke (`scripts/smoke-production.mjs`) passes with
  `SMOKE_SESSION_TOKEN` from a real account session.

## Post-Deploy

- [ ] `commandRejected.*` totals match expected baseline (no spike
  signalling a misclassified user action).
- [ ] `rateLimit.dropped.total` baseline holds.
- [ ] `clientMessages.invalidOwnership.total` baseline holds (a
  spike signals a hostile or buggy client).
- [ ] Roadmap entry for any security-relevant change is flipped
  with a concrete code/test pointer.
