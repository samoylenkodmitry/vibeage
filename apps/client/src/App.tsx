import { useRef } from 'react';
import { GameHud, StartPanel } from './Hud';
import { useGameClient } from './useGameClient';
import { WorldScene } from './WorldScene';

export default function App() {
  const client = useGameClient();
  const { state } = client;
  const cameraAngleRef = useRef(Math.PI * 0.82);

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
      />
      <GameHud
        state={state}
        cameraAngleRef={cameraAngleRef}
        onDisconnect={client.disconnect}
        onCastSkill={client.castSkill}
        onLearnSkill={client.learnSkill}
        onUseItem={client.useItem}
        onRespawn={client.respawn}
      />
      {state.connectionState !== 'online' && (
        <div className="joining-overlay" role="status">
          <strong>{state.message}</strong>
        </div>
      )}
    </main>
  );
}
