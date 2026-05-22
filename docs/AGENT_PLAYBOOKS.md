# Agent Playbooks

Use these playbooks to choose the smallest correct edit path. `pnpm run check` remains the full merge gate; scoped checks are fast confidence gates while iterating.

## Before Editing

- Check `git status --short --branch`.
- Read `AGENTS.md`, `ROADMAP.md`, and the relevant section of `docs/ARCHITECTURE.md`.
- Prefer active code under `apps/client`, `apps/server`, `server`, and `packages`.
- Treat `main` as production-affecting.
- Do not run production deploy scripts until the user explicitly asks.

## Protocol Message Changes

Edit:

- `packages/protocol/clientMessages.ts` or `packages/protocol/serverMessages.ts`.
- `packages/protocol/sessionEvents.ts` if the transport event name changes.
- `server/transport/roomBoundary.ts`.
- `server/world/clientMessageRouter.ts` or the specific server domain handler.
- `apps/client/src/roomConnection.ts`, `apps/client/src/clientActions.ts`, and `apps/client/src/gameReducer.ts` as needed.
- `docs/PROTOCOL.md` when visibility or message ownership changes.

Run:

- `pnpm run check:protocol`.
- `pnpm run check:server` if server behavior changed.
- `pnpm run check:client` if client behavior changed.

Rules:

- Runtime-validate new messages with Zod.
- Classify every new server message as public, region-scoped, or owner-only.
- Add a privacy or routing regression for private player fields and direct messages.

## Content Changes

Edit:

- `packages/content/skills.ts`.
- `packages/content/items.ts`.
- `packages/content/zones.ts`.
- `packages/content/lootTables.ts` or `packages/content/starterLootTables.ts`.
- `packages/content/worldContentValidation.ts` when validation rules change.

Run:

- `pnpm run check:content`.
- `pnpm run check:server` when content changes affect spawning, combat, loot, or persistence.
- `pnpm run check:client` when new content needs UI or VFX support.

Rules:

- Do not duplicate content constants in the client or server.
- Keep IDs stable once persisted or sent over the protocol.
- Add validation before adding large content sets.

## Movement And Combat Changes

Edit:

- Movement: `server/movement`, `server/world/tickPipeline.ts`, and client smoothing/camera files.
- Combat: `server/combat`, `packages/sim`, and `packages/content/skills.ts`.
- Death and rewards: `server/combat/targetDeath.ts`, `server/loot`, and `server/players`.

Run:

- `pnpm run check:server`.
- `pnpm run check:protocol` if messages change.
- `pnpm run check:client` if presentation changes.

Rules:

- Server remains authoritative for position, combat, loot, inventory, and progression.
- Keep pure math in `packages/sim` and test it without browser state.
- Use deterministic tests for costs, cooldowns, target death, and inventory side effects.

## Region Streaming Changes

Edit:

- `server/world/regions.ts`.
- `server/world/zoneRuntime.ts`.
- `server/transport/colyseusRoomAdapter.ts`.
- `server/transport/clientState.ts`.
- `packages/content/zones.ts` for zone definitions.

Run:

- `pnpm run check:server`.
- `pnpm run check:protocol` if outbound messages or snapshot shape changes.

Rules:

- Spawning and activation are global server decisions.
- Per-player code may only scope visibility and snapshots.
- Avoid per-client or per-entity allocations inside tick and broadcast loops.

## Client UI And Rendering Changes

Edit:

- `apps/client/src/Hud.tsx` and `apps/client/src/hud/*` for HUD.
- `apps/client/src/WorldScene.tsx`, `WorldEntities.tsx`, `SceneVfx.tsx`, and `CameraRig.tsx` for world presentation.
- `apps/client/src/gameReducer.ts` and `clientVisualState.ts` for client-only derived state.

Run:

- `pnpm run check:client`.
- `pnpm run test:e2e` when the start/play flow or HUD visibility changes.

Rules:

- Do not add server authority to browser-only state.
- Keep frame-loop allocations low.
- Prefer selectors and helpers over growing large React components.

## Persistence Changes

Edit:

- `server/persistence.ts`.
- `server/persistence/playerRepository.ts`.
- `server/db.ts`.
- `server/players/playerSession.ts`.
- `scripts/migrations`.

Run:

- `pnpm run check:server`.
- `pnpm run db:restore:test` when a migration or restore compatibility changes.
- `pnpm run check:scripts` when migration/deploy scripts change.

Rules:

- Add migrations for schema changes.
- Keep secrets in `.env`, never in source or docs.
- Preserve restore compatibility for local backup drills.

## Deployment Script Changes

Edit:

- `scripts/deploy-from-local.sh`.
- `scripts/deploy-production.sh`.
- `scripts/rollback-production.sh`.
- `scripts/health-production.sh`.
- `docker-compose.yml` and Nginx templates only after inspecting VPS assumptions.

Run:

- `pnpm run check:scripts`.
- `pnpm run health:production` only when the user asks to touch production.

Rules:

- Do not use old setup scripts as a live update path.
- Do not add GitHub-hosted SSH deployment or secrets unless the owner explicitly approves it.
- Be careful with Nginx because the VPS also hosts mail.

## Production Deploy Or Rollback

Deploy only after the user asks:

1. Confirm the branch and latest commit.
2. Run the relevant checks or explain why skipped.
3. Run `pnpm run deploy:production`.
4. Run `pnpm run health:production`.
5. Report commit SHA, health result, and any manual follow-up.

Rollback only after the user asks:

1. Inspect recent deploy state.
2. Run `pnpm run deploy:rollback`.
3. Run `pnpm run health:production`.

## PR And Review Cleanup

- Pull review comments into `ROADMAP.md` only if they still apply to current code.
- For review fixes, prefer a small patch and focused tests over broad rewrites.
- If a comment points at stale code, document why it is stale instead of changing unrelated runtime paths.

## Surfacing Silent Server Rejections (§52 pattern)

When a user-triggered action silently fails (the button does nothing,
the panel chip doesn't update, the chat doesn't send), the fix is
almost always to wire `CommandRejected` from the server through to
a client UI surface. The pattern that's been validated across many
PRs:

1. **Server**: replace `return` / `return false` in the handler
   with `sendCommandRejected(direct, '<CommandType>', '<reason>', clientSeq, targetId?)`.
   Pick the most informative reason; pass `targetId` (skill id,
   item id, etc.) when the rejection is per-subject.
2. **Client reducer**: route the envelope in `routeCommandRejected`
   (in `apps/client/src/gameReducer.ts`). Either append a friendly
   combat-log line (`applyXxxRejectedVisualState`) or update a
   panel state slot keyed by `targetId` (`learnSkillRejections`,
   `lastChatError`).
3. **Client UI**: render the friendly copy. Add a `<verb>RejectCopy`
   helper that maps `(commandType, reason)` to a sentence; fall
   through to the raw reason so future server enums still surface.
4. **Tests**:
   - Server-side: pin the envelope shape + `targetId` echo + the
     no-clientSeq fallback.
   - Reducer-side: pin the state write + the "unrelated commandType"
     no-op guard.
   - UI copy: one case per known (type, reason) pair + an
     unknown-fall-through case.
5. **Rate-limit drops**: only emit `CommandRejected` for low-frequency
   user-intent commands (see `RATE_LIMIT_FEEDBACK_COMMANDS` in
   `server/world/clientMessageRouter.ts`). Movement / cast / loot
   intents stay silent on rate-limit drop — they're high-frequency
   client-initiated, and the drop is normal there.
