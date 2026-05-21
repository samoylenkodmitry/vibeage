import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './Hud';
import { Lobby } from './Lobby';
import type { VecXZ } from '../../../packages/protocol/messages';
import type { CameraControls } from './CameraRig';
import { listActiveQuestMarkers } from './hud/questMarkers';
import { useGameClient } from './useGameClient';
import { WorldScene } from './WorldScene';

export default function App() {
  const client = useGameClient();
  const { state } = client;
  const cameraAngleRef = useRef(Math.PI * 0.82);
  const cameraControlsRef = useRef<CameraControls | null>(null);
  const touchClaimRef = useRef<Set<number>>(new Set());
  const [navigationMarker, setNavigationMarker] = useState<VecXZ | null>(null);
  useAutoMarkerOnQuestAccept(state, setNavigationMarker);

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
        onDropItem={client.dropItem}
        onDestroyItem={client.destroyItem}
        onCraftItem={client.craftItem}
        onEquipItem={client.equipItem}
        onUnequipItem={client.unequipItem}
        onUpgradeSkill={client.upgradeSkill}
        onTalkNpc={client.talkNpc}
        onAcceptQuest={client.acceptQuest}
        onCancelQuest={client.cancelQuest}
        onAdvanceQuest={client.advanceQuest}
        onClaimQuestReward={client.claimQuestReward}
        onSetTrackedQuest={client.setTrackedQuest}
        onBuyFromVendor={client.buyFromVendor}
        onSellToVendor={client.sellToVendor}
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

/**
 * §49/M2 — auto-drop a navigation marker on quest accept.
 *
 * Compares the player's current active-quest id set against a ref
 * holding the previous set. The first id that appears in `current`
 * but not in `previous` is treated as "just accepted" — we look up
 * its first-stage marker via `listActiveQuestMarkers` and write it
 * to the navigation marker. Progress updates on existing quests
 * don't retrigger (id set is unchanged).
 *
 * Edge case: on reconnect the entire active list appears as
 * "added" at once. The hook picks the first match and lets the
 * player clear or repick from the map.
 */
function useAutoMarkerOnQuestAccept(
  state: ReturnType<typeof useGameClient>['state'],
  setMarker: (marker: VecXZ | null) => void,
): void {
  const prevQuestIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const myId = state.myPlayerId;
    const player = myId ? state.players[myId] : null;
    const activeIds = new Set(Object.keys(player?.questState?.active ?? {}));
    const prev = prevQuestIdsRef.current;
    const added = [...activeIds].filter((id) => !prev.has(id));
    prevQuestIdsRef.current = activeIds;
    if (added.length === 0) return;
    const marker = listActiveQuestMarkers(player).find((m) => added.includes(m.questId))?.marker;
    if (marker) setMarker(marker);
  }, [state.myPlayerId, state.players, setMarker]);
}
