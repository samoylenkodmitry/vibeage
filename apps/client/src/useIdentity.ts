import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createCharacter,
  loadSession,
  saveSession,
  type LobbySession,
  type SavedCharacter,
} from './accountSession';
import { reclaimableName, startsAsGuest } from './identityCue';
import { becomeCharacter, type BecomeInput } from './onboarding';
import type { useGameClient } from './useGameClient';

type Client = ReturnType<typeof useGameClient>;
type ConnectionState = Client['state']['connectionState'];

export type Identity = {
  /** Playing as the Nameless guest (no hero bound to this session). */
  isGuest: boolean;
  /** Hero/login whose saved session was just rejected — drives the Return cue. */
  expiredHeroName: string | null;
  /** The identity panel is open *because the player opened it*. Never auto-set. */
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  enterWorld: (character: SavedCharacter, session: LobbySession) => void;
  handleBecome: (input: BecomeInput) => Promise<{ ok: boolean; error?: string }>;
  handleLogout: () => void;
};

/**
 * In-world identity: who the player currently is, and the transitions between
 * guest and hero — all of which happen while the world stays up and playable.
 *
 * The one rule this hook exists to keep: **nothing here ever opens the panel**.
 * `panelOpen` flips to true only through `openPanel`, which is wired to a
 * button. Recovery paths (expired token, logout) drop the player into the
 * world as the Nameless guest and leave a dismissible cue behind — they never
 * throw up a login form the player has to answer before they can play.
 */
export function useIdentity(client: Client): Identity {
  const [isGuest, setIsGuest] = useState(() => startsAsGuest());
  const [expiredHeroName, setExpiredHeroName] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const { connect, becomeCharacter: sendBecome } = client;

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  // Single entry point shared by the panel's Return/roster: persist the session
  // WITH the chosen hero (so the next visit drops straight back into it, no web
  // form), leave guest mode, and connect (reconnect as that saved hero).
  const enterWorld = useCallback((character: SavedCharacter, session: LobbySession) => {
    saveSession({ token: session.token, login: session.login, character });
    setIsGuest(false);
    setExpiredHeroName(null);
    setPanelOpen(false);
    connect(character.name, {
      race: character.race,
      className: character.className,
      sessionToken: session.token,
    });
  }, [connect]);

  // Become: authenticate, then — if we're an in-world guest — promote in place
  // so the trial's progress carries into the saved hero (no reconnect). If
  // we're not currently a live guest (rare: a disconnected/pre-connection
  // state), fall back to creating a fresh character and connecting into it.
  const handleBecome = useCallback(async (input: BecomeInput): Promise<{ ok: boolean; error?: string }> => {
    const outcome = await becomeCharacter(input);
    if (!outcome.ok || !outcome.character || !outcome.session) {
      return { ok: false, error: outcome.error };
    }
    const { character, session } = outcome;
    if (client.state.connectionState === 'online') {
      sendBecome({ name: character.name, race: character.race, className: character.className, sessionToken: session.token });
      saveSession({ token: session.token, login: session.login, character });
      setIsGuest(false);
      setExpiredHeroName(null);
      setPanelOpen(false);
      return { ok: true };
    }
    const created = await createCharacter(session.token, character);
    if (!created.ok) return { ok: false, error: created.error };
    enterWorld(character, session);
    return { ok: true };
  }, [client, sendBecome, enterWorld]);

  // Logging out drops the player back to a Nameless guest: clear the saved
  // session and reconnect anonymously, all without leaving the world.
  const handleLogout = useCallback(() => {
    saveSession(null);
    setIsGuest(true);
    setExpiredHeroName(null);
    setPanelOpen(false);
    connect('Nameless');
  }, [connect]);

  // Recovery when a saved token is rejected as invalid/expired on join. Drop
  // the dead session and re-enter as a Nameless guest — the world keeps
  // running — and remember who they were so the identity cue can offer a
  // one-click way back. Deliberately does NOT open the panel: an expired token
  // is our problem, not a toll gate the player has to pay to get in.
  const recoverFromExpiredSession = useCallback(() => {
    const dead = loadSession();
    saveSession(null);
    setIsGuest(true);
    setPanelOpen(false);
    setExpiredHeroName(reclaimableName(dead));
    connect('Nameless');
  }, [connect]);
  useExpiredSessionRecovery(client.state.connectionState, recoverFromExpiredSession);

  return { isGuest, expiredHeroName, panelOpen, openPanel, closePanel, enterWorld, handleBecome, handleLogout };
}

/**
 * An expired/invalid saved token lands the client in `sessionExpired`. React to
 * it once per transition by running the recovery (clear session → guest → cue).
 * `connect` inside the recovery moves us out of that state, so the ref guard
 * just prevents a double-fire (e.g. StrictMode's double effect).
 */
function useExpiredSessionRecovery(connectionState: ConnectionState, recover: () => void): void {
  const handledRef = useRef(false);
  useEffect(() => {
    if (connectionState !== 'sessionExpired') {
      handledRef.current = false;
      return;
    }
    if (handledRef.current) return;
    handledRef.current = true;
    recover();
  }, [connectionState, recover]);
}
