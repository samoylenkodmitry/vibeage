import { GameHud, StartPanel } from './Hud';
import { useGameClient } from './useGameClient';
import { WorldScene } from './WorldScene';

export default function App() {
  const client = useGameClient();
  const { state } = client;

  if (state.connectionState === 'idle') {
    return <StartPanel onStart={client.connect} />;
  }

  return (
    <main className="app-shell">
      <WorldScene state={state} onMove={client.sendMoveIntent} onSelectTarget={client.selectTarget} />
      <GameHud state={state} onDisconnect={client.disconnect} onCastSkill={client.castSkill} />
      {state.connectionState !== 'online' && (
        <div className="joining-overlay" role="status">
          <strong>{state.message}</strong>
        </div>
      )}
    </main>
  );
}
