# apps/client/src

Owns the Vite React client: Colyseus connection, local presentation state, HUD, 3D scene, input, and test hooks.

## Entry Points

- `main.tsx` and `App.tsx`: app root.
- `useGameClient.ts`: client facade that combines reducer, transport, and actions.
- `roomConnection.ts`: Colyseus lifecycle and message handling.
- `clientActions.ts`: browser commands sent to the server.
- `gameReducer.ts`: client state updates from snapshots and messages.
- `Hud.tsx` and `hud/*`: HUD panels.
- `WorldScene.tsx`, `WorldEntities.tsx`, `SceneVfx.tsx`, and `CameraRig.tsx`: world presentation.

## Common Edits

- Keep final authority on the server; client state is for rendering, input, smoothing, and feedback.
- Update reducer tests when snapshots/messages change.
- Keep frame-loop allocations low in scene and camera code.

## Tests

- `pnpm run check:client`
- `pnpm run test:e2e` when join flow, HUD, input, or skill bar behavior changes
