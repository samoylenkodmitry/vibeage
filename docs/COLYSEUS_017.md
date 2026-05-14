# Colyseus 0.17 Runtime Window

This project now runs the active multiplayer path on the Colyseus 0.17 package line.

## Package Set

- `@colyseus/core`: `0.17.43`
- `@colyseus/ws-transport`: `0.17.13`
- `@colyseus/schema`: `4.0.25`
- `@colyseus/sdk`: `0.17.42`

The old `colyseus.js` browser package was removed. Client and tooling imports should use `@colyseus/sdk`.

## Local Impact

The current server still uses explicit `Server` plus `WebSocketTransport` setup, so the 0.17 migration did not require moving to the newer `defineServer()` structure immediately. That can wait until the `apps/server` composition layer is larger.

The current runtime does not use direct matchmaker seat-reservation access, custom `Room` generics, or `Protocol.WS_*` constants, which are the main 0.17 breaking areas called out by the upstream migration notes.

## Verification

Before deploying dependency changes, run:

```sh
pnpm install --frozen-lockfile
pnpm run check
BASELINE_START_LOCAL=1 BASELINE_ENFORCE=1 BASELINE_SKIP_BROWSER_FPS=1 pnpm run measure:baseline
```
