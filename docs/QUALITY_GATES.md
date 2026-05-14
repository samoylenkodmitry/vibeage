# Quality Gates

`pnpm run check` is the local gate and mirrors CI as closely as possible.

It currently enforces:

- ESLint with zero warnings.
- Client and server TypeScript typechecks.
- VPS deployment shell script syntax checks.
- Maintainability budgets for file size, function size, function arguments, and nesting depth.
- Vitest unit/server tests.
- Server and frontend production builds.
- Playwright browser smoke test.
- Performance budget smoke for bundle size, deterministic server tick cost, configured spawn scale, and Colyseus room join/game-state latency in CI.
- GitHub secret scanning via gitleaks in CI.
- Dependabot config is kept in Git, but version-update PRs are currently disabled with `open-pull-requests-limit: 0` to avoid dependency noise during runtime migration work.

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
