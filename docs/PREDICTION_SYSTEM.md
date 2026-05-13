# Entity Position Prediction And Interpolation

The current Vite client consumes server-authoritative position snapshots and renders them smoothly between network updates. The server can attach short prediction keyframes to `PosSnap` messages; the client keeps authoritative state in the reducer and handles presentation smoothing in the scene layer.

## Key Components

### 1. Server-Side Prediction

The server predicts future positions for entities (players and enemies) based on their current state:
- For players: Predicts movement based on the target position they're heading toward
- For enemies: Predicts movement based on velocity or AI behavior

These predictions are sent as part of the `PosSnap` messages, allowing clients to smoothly interpolate between current and future positions.

### 2. Client-Side Presentation

The client uses the latest authoritative state as truth and smooths visual transforms in the render layer. Gameplay decisions still come from server state, not interpolated presentation state.

### 3. Debugging

Server prediction logging lives behind the existing snapshot delta path. Browser smoke tests cover connected movement so prediction changes are checked against the real Vite client.

## Files Modified

### Shared
- `packages/protocol/messages.ts`: Added `PredictionKeyframe` interface and updated `PosSnap` interface

### Server
- `server/movement/worldMovement.ts`:
  - predicts future entity states and keyframes
- `server/movement/snapshotDeltas.ts`:
  - collects `PosSnap` messages and attaches prediction keyframes

### Client
- `apps/client/src/useGameClient.ts`:
  - receives Colyseus room messages and dispatches reducer actions
- `apps/client/src/gameReducer.ts`:
  - applies authoritative `PosSnap` positions
- `apps/client/src/WorldScene.tsx`:
  - smooths visual camera and entity presentation

## How It Works

1. The server calculates the current authoritative position of an entity
2. It then predicts where the entity will be in the next 1-2 ticks using `predictEntityStateAtOffset`
3. These predictions are sent to clients as part of the `PosSnap` message.
4. The Vite reducer stores the latest authoritative position.
5. The scene layer renders movement smoothly without changing authoritative game state.

## Benefits

- Smoother movement visualization, especially with network jitter
- Reduced perceived latency as client can animate toward server-anticipated positions
- More accurate position estimation between network updates
- Better visual quality for remote player and enemy movement
