import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { GameHud } from './Hud';
import { AwakeningPanel } from './AwakeningPanel';
import { hasSavedSession, loadSession, saveSession, type LobbySession, type SavedCharacter } from './accountSession';
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

// Instant world: on the first page load we connect immediately — no lobby, no
// login wall. A returning player with a remembered hero drops straight into it;
// everyone else enters as a Nameless guest and picks an identity in-world.
//
// The ref makes this a strict once-ever auto-join: without it, a player who
// hits Disconnect drops to `idle` and would be auto-rejoined on the spot — an
// unbreakable loop. roomConnection owns reconnect on transient drops, so we
// only seed the very first entry; a manual disconnect lands on the lobby.
function useAutoEnter(client: ReturnType<typeof useGameClient>): void {
  const hasJoinedRef = useRef(false);
  const { connect, state: { connectionState } } = client;
  useEffect(() => {
    if (hasJoinedRef.current) return;
    if (connectionState !== 'idle') return;
    const session = loadSession();
    if (session?.character) {
      hasJoinedRef.current = true;
      connect(session.character.name, {
        race: session.character.race,
        className: session.character.className,
        sessionToken: session.token,
      });
    } else if (!session) {
      hasJoinedRef.current = true;
      connect('Nameless');
    }
    // A session with a token but no remembered hero (just logged in, or a
    // legacy save) falls through to the lobby to pick / create a character.
  }, [connect, connectionState]);
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

// Pre-connection screen. On the first load we show only the loader while we
// auto-enter (straight into a remembered hero, or as a guest). We show the
// in-world identity panel — to pick a hero, switch, log out, or manage the
// account — only when there's a session with no remembered hero, or after a
// first connection attempt has ended back at `idle`. No web form, ever.
function EntryView({
  onEnter,
  onLogout,
  hasAttempted,
}: {
  onEnter: (character: SavedCharacter, session: LobbySession) => void;
  onLogout: () => void;
  hasAttempted: boolean;
}) {
  const session = loadSession();
  if ((session && !session.character) || hasAttempted) {
    return <AwakeningPanel initialSession={session} onEnter={onEnter} onLogout={onLogout} />;
  }
  return <InstantWorldLoader />;
}

// A fresh visitor with no saved session plays as the Nameless guest until the
// in-world Awakening flow (Become / Return) binds them to a real hero.
function useGuestAwakening(client: ReturnType<typeof useGameClient>) {
  const [isGuest, setIsGuest] = useState(() => !hasSavedSession());
  const [showAwakening, setShowAwakening] = useState(false);
  const { connect } = client;
  // Single entry point shared by the lobby and the Awakening panel: persist the
  // session WITH the chosen hero (so the next visit drops straight back into it,
  // no web form), leave guest mode, and connect. Depends only on the stable
  // `connect` so it isn't rebuilt every render.
  const enterWorld = useCallback((character: SavedCharacter, session: LobbySession) => {
    saveSession({ token: session.token, login: session.login, character });
    setIsGuest(false);
    setShowAwakening(false);
    connect(character.name, {
      race: character.race,
      className: character.className,
      sessionToken: session.token,
    });
  }, [connect]);
  // Logging out drops the player back to a Nameless guest: clear the saved
  // session and reconnect anonymously, all without leaving the world.
  const handleLogout = useCallback(() => {
    saveSession(null);
    setIsGuest(true);
    setShowAwakening(false);
    connect('Nameless');
  }, [connect]);
  return { isGuest, showAwakening, setShowAwakening, enterWorld, handleLogout };
}

// True once we've *attempted* the first connection (left `idle`). The auto-join
// fires only once, so if that first attempt drops back to `idle` — a manual
// disconnect OR a failed connect — the entry view must show the lobby (re-enter
// / switch hero / log out) rather than the auto-entry loader, which would
// otherwise hang forever. Keying on "attempted" (not "reached online") covers
// the failed-connect case too.
function useHasAttempted(connectionState: ReturnType<typeof useGameClient>['state']['connectionState']): boolean {
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (connectionState !== 'idle') setAttempted(true);
  }, [connectionState]);
  return attempted;
}

// In-world identity affordance over the live HUD: a glowing "Awaken" prompt for
// a Nameless guest, or a quiet "Heroes" button for a logged-in hero — both open
// the one identity panel (guest → Become/Return; hero → roster + account).
function IdentityLayer({
  isGuest,
  online,
  showAwakening,
  onOpen,
  onClose,
  onEnter,
  onLogout,
}: {
  isGuest: boolean;
  online: boolean;
  showAwakening: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEnter: (character: SavedCharacter, session: LobbySession) => void;
  onLogout: () => void;
}) {
  // Read the saved session only when the identity actually changes (isGuest
  // flips on enter/logout), not on every game-state tick — App re-renders
  // constantly, and loadSession() is synchronous localStorage I/O + JSON.parse.
  const heroSession = useMemo(() => (isGuest ? null : loadSession()), [isGuest]);
  if (!online) return null;
  return (
    <>
      {!showAwakening && (isGuest ? (
        <button type="button" className="awaken-cta" onClick={onOpen}>
          <span className="awaken-cta-spark" aria-hidden="true">✦</span>
          You are <strong>Nameless</strong> — Awaken to claim your fate
        </button>
      ) : (
        <button type="button" className="account-button" onClick={onOpen} aria-label="Heroes and account">
          <span aria-hidden="true">⚜</span> Heroes
        </button>
      ))}
      {showAwakening && (
        <AwakeningPanel
          initialSession={heroSession}
          onEnter={onEnter}
          onClose={onClose}
          onLogout={onLogout}
        />
      )}
    </>
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
  useAutoEnter(client);
  const { isGuest, showAwakening, setShowAwakening, enterWorld, handleLogout } = useGuestAwakening(client);
  const hasAttempted = useHasAttempted(state.connectionState);

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
    return <EntryView onEnter={enterWorld} onLogout={handleLogout} hasAttempted={hasAttempted} />;
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
      <IdentityLayer
        isGuest={isGuest}
        online={state.connectionState === 'online'}
        showAwakening={showAwakening}
        onOpen={() => setShowAwakening(true)}
        onClose={() => setShowAwakening(false)}
        onEnter={enterWorld}
        onLogout={handleLogout}
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
