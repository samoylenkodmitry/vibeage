# Agent Guide

- Work from `main`; use a feature branch for larger changes.
- `main` deploys to the VPS. The old `server` branch is retired.
- Deploy only from this machine with `pnpm run deploy:production`.
- Never commit `.env`, keys, tokens, DB URLs, or generated output.
- Spawning and activation are server-owned and global; players only affect visibility.
- Keep new gameplay out of `server/world.ts`, `gameReducer.ts`, and transport glue unless it is a tiny fix.
- Prefer `packages/content`, `packages/sim`, and `packages/protocol` over legacy shared paths.
- Run `pnpm run check` before push when code changes.
