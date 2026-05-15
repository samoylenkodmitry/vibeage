import { useRef, useState } from 'react';
import { GameHud, StartPanel } from './Hud';
import type { VecXZ } from '../../../packages/protocol/messages';
import type { CameraControls } from './CameraRig';
import { useGameClient } from './useGameClient';
import { WorldScene } from './WorldScene';

export default function App() {
  const client = useGameClient();
  const { state } = client;
  const cameraAngleRef = useRef(Math.PI * 0.82);
  const cameraControlsRef = useRef<CameraControls | null>(null);
  const touchClaimRef = useRef<Set<number>>(new Set());
  const [navigationMarker, setNavigationMarker] = useState<VecXZ | null>(null);

  if (state.connectionState === 'idle') {
    return <StartPanel onStart={client.connect} />;
  }

  return (
    <main className="app-shell">
      <WorldScene
        state={state}
        onMove={client.sendMoveIntent}
        onSelectTarget={client.selectTarget}
        onPickUpLoot={client.pickUpLoot}
        cameraAngleRef={cameraAngleRef}
        cameraControlsRef={cameraControlsRef}
        touchClaimRef={touchClaimRef}
        navigationMarker={navigationMarker}
      />
      <GameHud
        state={state}
        cameraAngleRef={cameraAngleRef}
        navigationMarker={navigationMarker}
        onSetNavigationMarker={setNavigationMarker}
        onDisconnect={client.disconnect}
        onCastSkill={client.castSkill}
        onLearnSkill={client.learnSkill}
        onUseItem={client.useItem}
        onRespawn={client.respawn}
        onSendChat={client.sendChat}
      />
      {state.connectionState !== 'online' && (
        <div className="joining-overlay" role="status">
          <strong>{state.message}</strong>
        </div>
      )}
    </main>
  );
}
