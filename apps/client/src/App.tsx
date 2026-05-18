import { useRef, useState } from 'react';
import { GameHud } from './Hud';
import { Lobby } from './Lobby';
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
    return (
      <Lobby
        onEnter={(character) => {
          // Race + class flow through the join handshake (see
          // packages/protocol roomBoundary.WorldRoomJoinOptions); the
          // server applies them only on first character spawn, so
          // existing characters keep their persisted identity.
          client.connect(character.name, { race: character.race, className: character.className });
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
        onAttackTarget={client.attackTarget}
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
        onSelectSpecialization={client.selectSpecialization}
        onUpgradeSkill={client.upgradeSkill}
        onTalkNpc={client.talkNpc}
        onAcceptQuest={client.acceptQuest}
        onCancelQuest={client.cancelQuest}
        onAdvanceQuest={client.advanceQuest}
        onClaimQuestReward={client.claimQuestReward}
        onGmCommand={client.gmCommand}
        onRespawn={client.respawn}
        onSelectTarget={client.selectTarget}
        onCycleTarget={client.cycleTarget}
        onPickupNearest={client.pickupNearest}
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
