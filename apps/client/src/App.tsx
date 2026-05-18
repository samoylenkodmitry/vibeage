import { useCallback, useRef, useState } from 'react';
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

  // Move action: walk to the selected target if any, else to the map
  // pin. Sends a raw MoveIntent (no auto-attack), which cleans up
  // pending casts / pickups / auto-attack on its own.
  const onMove = useCallback(() => {
    const enemy = state.selectedTargetId ? state.enemies[state.selectedTargetId] : null;
    if (enemy?.isAlive) {
      client.sendMoveIntent({ x: enemy.position.x, z: enemy.position.z });
      return;
    }
    if (navigationMarker) {
      client.sendMoveIntent({ x: navigationMarker.x, z: navigationMarker.z });
    }
  }, [state.selectedTargetId, state.enemies, navigationMarker, client]);

  if (state.connectionState === 'idle') {
    return (
      <Lobby
        onEnter={(character, session) => {
          // World join verifies the session token + looks up the
          // character by (accountId, name). race/className aren't
          // applied on the join path anymore (character row was
          // created by the lobby's POST), but kept for back-compat.
          client.connect(character.name, {
            race: character.race,
            className: character.className,
            sessionToken: session.token,
          });
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
        onMove={onMove}
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
