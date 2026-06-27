import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { GameHud } from './Hud';
import { Lobby } from './Lobby';
import type { VecXZ } from '../../../packages/protocol/messages';
import type { CameraControls } from './CameraRig';
import { listActiveQuestMarkers } from './hud/questMarkers';
import { useWorldDropTarget } from './hud/useWorldDropTarget';
import { useRehydrateTrackedQuest } from './trackedQuestStorage';
import { useGameClient } from './useGameClient';

// The entire 3D engine (three / r3f / drei / postprocessing / world-art) lives
// under WorldScene and is only mounted once the player connects — the lobby
// before it is pure DOM. Loading it lazily keeps the whole three.js stack out
// of the initial bundle: the page boots into the lobby fast, and the ~540 kB
// world chunk streams in during the connect handshake. See the bundle budget
// in quality/performance-budgets.json (measured as the initial entry graph).
const WorldScene = lazy(() => import('./WorldScene').then((m) => ({ default: m.WorldScene })));

// Prefetch the lazy world chunk while the player is still in the lobby, so it
// streams in the background (overlapping the connect handshake) and entering the
// world is instant — without pulling WorldScene back into the initial bundle (a
// dynamic import() stays a separate async chunk). Also warms the chunk for the
// e2e dev server before the first interaction.
function useWorldChunkPrefetch(): void {
  useEffect(() => {
    void import('./WorldScene');
  }, []);
}

// Lazy boundary for the world. Kept out of App's body so the connect branch
// stays small; the fallback is null because GameHud renders immediately and the
// world fades in a beat later once its chunk resolves.
function LazyWorldScene(props: ComponentProps<typeof WorldScene>) {
  return (
    <Suspense fallback={null}>
      <WorldScene {...props} />
    </Suspense>
  );
}

const SESSION_KEY = 'vibeage:session';
function hasSavedSession(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage.getItem(SESSION_KEY));
  } catch {
    return false;
  }
}

// Instant world: a brand-new visitor (no saved session) is joined as a Nameless
// guest the instant the page loads — no lobby, no login wall. The server spawns
// a transient guest for the tokenless join; from inside the world they later
// pick race/class/name ("Become") or log in ("Return"). Runs once on mount.
function useInstantGuestJoin(client: ReturnType<typeof useGameClient>): void {
  useEffect(() => {
    if (client.state.connectionState === 'idle' && !hasSavedSession()) {
      client.connect('Nameless');
    }
    // Once-on-mount: a fresh visitor enters instantly.
  }, [client]);
}

// While the guest connection + world chunk stream in (a beat), show a loader,
// never a form — the whole onboarding happens in-world.
function InstantWorldLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
        background: '#0b1020', color: '#e8eaf2', letterSpacing: '0.04em',
      }}
    >
      <strong style={{ fontSize: '2rem', letterSpacing: '0.18em' }}>VibeAge</strong>
      <span style={{ opacity: 0.65 }}>Awakening…</span>
    </div>
  );
}

// Pre-connection screen. A returning visitor (saved session) still goes through
// the lobby for now; a new visitor sees only the loader while they auto-join.
function EntryView({ client }: { client: ReturnType<typeof useGameClient> }) {
  if (!hasSavedSession()) return <InstantWorldLoader />;
  return (
    <Lobby
      onEnter={(character, session) => {
        client.connect(character.name, {
          race: character.race,
          className: character.className,
          sessionToken: session.token,
        });
      }}
    />
  );
}

export default function App() {
  const client = useGameClient();
  const { state } = client;
  const cameraAngleRef = useRef(Math.PI * 0.82);
  const cameraControlsRef = useRef<CameraControls | null>(null);
  const touchClaimRef = useRef<Set<number>>(new Set());
  const [navigationMarker, setNavigationMarker] = useState<VecXZ | null>(null);
  useAutoMarkerOnQuestAccept(state, setNavigationMarker);

  useRehydrateTrackedQuest(client.setTrackedQuest);
  useWorldChunkPrefetch();
  useInstantGuestJoin(client);

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
  const worldDropHandlers = useWorldDropTarget(client.dropItem);

  if (state.connectionState === 'idle') {
    return <EntryView client={client} />;
  }

  return (
    <main className="app-shell" {...worldDropHandlers}>
      <LazyWorldScene
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
        onGmTeleport={client.devTeleport}
        onDisconnect={client.disconnect}
        onCastSkill={client.castSkill}
        onLearnSkill={client.learnSkill}
        onSelectSpecialization={client.selectSpecialization}
        onUseItem={client.useItem}
        onDropItem={client.dropItem}
        onDestroyItem={client.destroyItem}
        onMoveItem={client.moveInventorySlot}
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
