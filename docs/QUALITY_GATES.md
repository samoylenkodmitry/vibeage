# Quality Gates

`pnpm run check` is the local gate and mirrors CI as closely as possible.

It currently enforces:

- ESLint with zero warnings.
- Client and server TypeScript typechecks.
- Strict TypeScript typecheck for leaf packages under `packages`.
- VPS deployment shell script syntax checks.
- Maintainability budgets for file size, function size, function arguments, and nesting depth.
- Dead-code/dependency scanning for unused files, dependencies, unlisted binaries, unresolved imports, and duplicate exports.
- Vitest unit/server tests.
- Server and frontend production builds.
- Playwright browser smoke test.
- Performance budget smoke for bundle size, deterministic server tick cost, configured spawn scale, and Colyseus room join/game-state latency in CI.
- GitHub secret scanning via gitleaks in CI.
- Dependabot config is kept in Git, but version-update PRs are currently disabled with `open-pull-requests-limit: 0` to avoid dependency noise during runtime migration work.

## Scoped Checks

Use these while iterating on focused changes. They do not replace `pnpm run check` before merge, but they keep agent work faster and more targeted.

- `pnpm run check:server`: lint server/shared runtime paths, typecheck the server build, run focused server Vitest files, and build the server.
- `pnpm run check:client`: lint client/shared runtime paths, typecheck the Vite client, run reducer/camera/visual tests, and build the client.
- `pnpm run check:protocol`: lint protocol boundary files, typecheck server and client protocol users, and run schema/privacy/transport tests.
- `pnpm run check:content`: lint content boundary files, run content validation, and run content behavior tests.
- `pnpm run typecheck:packages`: strict TypeScript check for `packages/content`, `packages/protocol`, and `packages/sim`.
- `pnpm run check:deadcode`: run the CI-blocking Knip subset for files, dependencies, unlisted binaries, unresolved imports, and duplicate exports.
- `pnpm run deadcode:report`: run the full Knip report without failing; use it to work down the current unused-export baseline.

## Dead-Code Baseline

Knip is configured in `knip.json`.

The blocking gate intentionally starts with issue types that are safe to enforce immediately. The full report still shows existing unused exports and exported types so cleanup work is visible, but those are not merged into the blocking gate until the baseline is reduced.

## Maintainability Budgets

The maintainability gate is configured in `quality/maintainability.json`.

Current budgets:

- Max file length: 700 lines.
- Max function length: 100 lines.
- Max function parameters: 6.
- Max nesting depth: 5.

The current prototype has known oversized legacy files. Those files are listed in `legacyFiles` with their current line count. A legacy entry is not a free pass to grow the file; it pins the file at its current ceiling and skips function-level checks until the file is split.

For new work:

- Do not add new legacy exceptions unless documenting an existing cleanup target.
- Prefer extracting pure simulation/content/protocol code over growing React components or server loops.
- If a file exceeds a budget, split behavior by responsibility instead of raising the global limit.

## Performance Budgets

The performance budget smoke is configured in `quality/performance-budgets.json`.
The latest local baseline sample is recorded in `quality/performance-baseline.json`.

- CI runs `BASELINE_START_LOCAL=1 BASELINE_ENFORCE=1 BASELINE_SKIP_BROWSER_FPS=1 pnpm run measure:baseline` after the frontend build.
- Local enforced measurement is `pnpm run measure:check`, using the same stable non-browser subset as CI.
- Browser FPS is available through `pnpm run measure:browser`; it is diagnostic because headless rendering is noisy.
- Spawn-scale budgets cover spawned enemies, configured maximum initial enemy spawns, maximum enemies per zone, and zone count.

## Load Test Tooling (§52 #12)

In-process load test scripts let you exercise the full server tick
pipeline at N simulated players without standing up real WebSocket
clients. Useful for capacity-planning investigations and one-shot
"what does the snapshot phase do at 100 bots?" checks.

- `pnpm run load:inprocess` — runs one configuration. Environment
  knobs: `LOAD_PLAYERS`, `LOAD_TICKS`, `LOAD_TICK_MS`, `LOAD_SNAP_HZ`,
  `LOAD_MOVE_INTERVAL`. Emits a JSON report covering tick percentiles,
  every populated runtime histogram (snapshot bytes, DB write
  latency, join latency), outbound counts by message type, and
  memory deltas.
- `pnpm run load:sweep` — runs the same loop at several player
  counts in sequence (default `10,50,100`; override via
  `LOAD_SWEEP=10,50,100,200`). Each step gets a fresh GameState +
  reset runtimeMetrics so they don't contaminate each other. Output
  includes a `summary.scalingNotes` block with "N → M bots (Xx):
  tick Yx, outbound Zx" one-liners for the cliff signal.
- Both scripts use a no-op outbound sink. They measure server tick
  work, not network/JSON cost. The snapshot.bytes histogram still
  records because the snapshot phase calls JSON.stringify on its
  own; the outbound counters live at the emit helpers so they record
  regardless of sink (see `tests/outboundMessageMetrics.spec.ts`).
- `tests/loadTestSmoke.spec.ts` runs the inner loop at tiny scale
  (5 bots, 60 ticks) so the scaffold can't bit-rot in CI.

Run with `--expose-gc` if you want the memory-delta lines to be
meaningful (`node --expose-gc -- node_modules/.bin/tsx
scripts/load-test-sweep.ts`).
