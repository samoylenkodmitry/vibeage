import { useEffect, useRef, useState } from 'react';
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
  const pendingIdentity = useRef<{ race: string; className: string } | null>(null);
  const [appliedIdentity, setAppliedIdentity] = useState(false);

  // Once the join handshake completes, push the race + class the player picked
  // on the start screen to the server. Avoids changing the join protocol.
  useEffect(() => {
    if (state.connectionState !== 'online' || appliedIdentity) {
      return;
    }
    const choice = pendingIdentity.current;
    if (!choice) {
      return;
    }
    client.selectRace(choice.race);
    client.selectClass(choice.className);
    pendingIdentity.current = null;
    setAppliedIdentity(true);
  }, [state.connectionState, appliedIdentity, client]);

  if (state.connectionState === 'idle') {
    return (
      <StartPanel
        onStart={(name, race, className) => {
          pendingIdentity.current = { race, className };
          setAppliedIdentity(false);
          client.connect(name);
        }}
      />
    );
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
        onEquipItem={client.equipItem}
        onUnequipItem={client.unequipItem}
        onSelectClass={client.selectClass}
        onSelectRace={client.selectRace}
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
