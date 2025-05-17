# Enhanced Entity Position Prediction and Interpolation

This feature adds server-side prediction of entity positions with keyframe-based interpolation on the client for smoother movement visualization.

## Key Components

### 1. Server-Side Prediction

The server predicts future positions for entities (players and enemies) based on their current state:
- For players: Predicts movement based on the target position they're heading toward
- For enemies: Predicts movement based on velocity or AI behavior

These predictions are sent as part of the `PosSnap` messages, allowing clients to smoothly interpolate between current and future positions.

### 2. Client-Side Interpolation

The client now uses a more sophisticated interpolation system:
- Instead of just using the latest position snapshot, it utilizes a mini-timeline of positions
- Interpolates between the appropriate keyframes based on the render timestamp
- Falls back to extrapolation when rendering beyond the last predicted position

### 3. Debugging Tools

Two debugging tools have been added to help visualize and troubleshoot the prediction system:
- `PredictionDebug`: A UI overlay showing numerical data about predictions (toggle with F6)
- `PredictionPath`: A 3D visualization of predicted paths in the game world (toggle with F7)

## Files Modified

### Shared
- `shared/messages.ts`: Added `PredictionKeyframe` interface and updated `PosSnap` interface

### Server
- `server/world.ts`: 
  - Added `predictEntityStateAtOffset` function to predict future entity states
  - Modified `collectDeltas` to include predictions in PosSnap messages

### Client
- `app/game/systems/interpolation.ts`: 
  - Updated the `Snap` interface to include predictions
  - Implemented new interpolation logic in `SnapBuffer.sample()`
  - Exposed buffers globally for debugging

- `app/game/systems/SocketManager.tsx`: 
  - Updated `handlePosSnap` to process prediction data

- New debug components:
  - `app/game/components/PredictionDebug.tsx`
  - `app/game/components/PredictionPath.tsx`

## How It Works

1. The server calculates the current authoritative position of an entity
2. It then predicts where the entity will be in the next 1-2 ticks using `predictEntityStateAtOffset`
3. These predictions are sent to clients as part of the `PosSnap` message
4. The client builds a timeline from the current position and predictions
5. For each render frame, the client:
   - Finds the appropriate segment in the timeline that brackets the render time
   - Interpolates between the keyframes in that segment
   - If rendering beyond the last keyframe, it extrapolates using velocity

## Usage

The feature works automatically once implemented. The debug tools can be toggled with:
- F6: Toggle the numerical debug overlay
- F7: Toggle the 3D visualization of prediction paths

## Benefits

- Smoother movement visualization, especially with network jitter
- Reduced perceived latency as client can animate toward server-anticipated positions
- More accurate position estimation between network updates
- Better visual quality for remote player and enemy movement
