# VibeAge Server App

`apps/server/src/main.ts` is the runtime entrypoint for the game server app.

Most authoritative game modules still live under the root `server/` directory while the migration is in progress. New server app entrypoint or composition code should land here; reusable gameplay, simulation, content, and protocol logic should land in `packages/` or focused root `server/` modules until those modules are moved deliberately.
