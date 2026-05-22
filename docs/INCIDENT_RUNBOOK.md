# Incident Runbook

Short, actionable steps for the on-call (single-operator owner today).
Everything in this doc assumes you can SSH to the VPS and run
`pnpm run health:production` / `pnpm run deploy:rollback` from this repo.

## Quick triage

Open in this order:

1. `pnpm run health:production` — does the public /healthz answer? What SHA?
2. `https://vibeage.eu/runtimez` with `x-runtimez-token` set — live metrics.
3. VPS `docker compose ps` (or `journalctl -u vibeage`) — is the
   container running? Restarting?
4. Recent deploys: `git log --oneline -10 main` — was anything shipped
   in the last hour?

If `health:production` fails and the container is restarting on its own,
go straight to rollback below. Otherwise diagnose first.

## Symptom → first action

### Players report "I can't log in" / lobby spinner

- Check the auth endpoint: `curl -X POST https://vibeage.eu/api/auth -d '{}' -H 'content-type: application/json'` should return a 400 (not a connect error / 502).
- If 502: Nginx is up but the game container is down. `docker compose restart game` on the VPS.
- If the auth endpoint is fine but the WebSocket join hangs: check `commandRejected.ChatRequest.*` and `clientMessages.rejected` in `/runtimez`. A high baseline of `clientMessages.rejected` signals a protocol drift after a deploy — rollback.

### Players report "I respawned and lost progress"

- Check `commandRejected.RespawnRequest.*` and `clientMessages.invalidOwnership.RespawnRequest`. Spikes mean the new socket isn't matching the persisted player row.
- Check `server_events` for recent `player_disconnect` rows — was `persistPlayer` called? If `persist.failed` counter is non-zero, the DB connection is unhealthy.
- If a recent deploy touched `persistence.ts` / `playerRepository.ts` / hydration: rollback.

### Players report "Combat is desynced" / "I hit but no damage"

- Check `commandRejected.CastReq.*` baseline. `cooldown` / `nomana` / `outofrange` are normal player friction; `invalid` / `targetNotFound` spikes mean the world view is drifting.
- Tick budget: `/runtimez` shows `tickMs` percentiles. p99 > 30 ms means the tick loop is blocking.
- Phase histograms (`tick.phase.snapshot`, `tick.phase.combat`, `tick.phase.enemyAi`) tell you which phase is eating the budget.

### Server CPU pinned

- `/runtimez` — `enemies.alive`, `players.active`, `casts.active`, `loot.groundStacks`. Did one of these spike unexpectedly?
- If a recent deploy introduced new AI behavior or a new mob type: rollback.
- If it's organic load: kick a bot horde out via GM commands (DevTeleport behind `VIBEAGE_ENABLE_DEV_COMMANDS` — must be re-enabled briefly).

### Container OOM / restart loop

- `docker compose logs --tail=200 game` — look for "Unhandled Promise Rejection" or "[SYSTEM] Error in periodic player persistence".
- Heap snapshot: `/runtimez` `memory.heapUsedMb` trend over time.
- Restart the container while you investigate (don't deploy a stale build to recover; `docker compose restart` is enough).

## Rollback

If the latest deploy caused the incident:

1. From this machine: `pnpm run deploy:rollback`.
2. `pnpm run health:production` — verify the rolled-back SHA is what
   you expected.
3. Open a follow-up branch with a regression test that pins the bug
   so we don't ship it again.

## After the fire is out

- Write down what happened in `docs/incidents/<date>-<short-slug>.md` even if it's three sentences. Future-you will thank present-you.
- If a counter/metric/log would have helped you diagnose faster, add it before closing the incident loop.
- If the rollback restored a known-good SHA but `main` still has the bad change: revert on a branch, open a PR, mark it `revert:` in the title.

## Touch points

- Production deploys live in `scripts/deploy-from-local.sh` / `deploy-production.sh`.
- The pre-deploy checklist is `docs/SECURITY_REVIEW.md`.
- The metric / counter dictionary is whatever `/runtimez` returns; new entries land via `server/observability/runtimeMetrics.ts`.
- Backups: `docs/POSTGRES_BACKUPS.md`.
