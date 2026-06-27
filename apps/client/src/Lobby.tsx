import { FormEvent, useCallback, useEffect, useState } from 'react';
import { type CharacterClass } from '../../../packages/content/classes';
import { RACE_PROFILES, type CharacterRace } from '../../../packages/content/races';
import { RaceClassPicker } from './RaceClassPicker';
import {
  deleteCharacter,
  fetchRoster,
  humanReadableAuthError,
  loadSession,
  revokeSessionToken,
  saveSession,
  type LobbySession,
  type SavedCharacter,
} from './accountSession';

/**
 * Pre-game lobby. Login + password flow against the server-side
 * accounts table. After auth: load the account's character roster
 * from /api/account/characters, pick one + Enter, or open the
 * Create form (race → class → POST → back to lobby).
 *
 * The session token + login are persisted to localStorage so a
 * reload doesn't kick the player back to the login screen. Tokens
 * are server-signed HMAC and expire — a 401 from the roster fetch
 * drops the cache and shows the login form again.
 *
 * Session storage, the auth/roster/create HTTP helpers, and the
 * race/class picker all live in shared modules (`accountSession`,
 * `RaceClassPicker`) so the in-world Awakening flow reuses the exact
 * same plumbing.
 */
export function Lobby({
  onEnter,
}: {
  onEnter: (character: SavedCharacter, session: LobbySession) => void;
}) {
  const [session, setSession] = useState<LobbySession | null>(() => loadSession());
  const [characters, setCharacters] = useState<SavedCharacter[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const refreshRoster = useCallback(async (s: LobbySession) => {
    setLoadingRoster(true);
    setRosterError(null);
    try {
      const result = await fetchRoster(s.token);
      if (result === 'unauthorized') {
        saveSession(null);
        setSession(null);
        setCharacters(null);
        return;
      }
      setCharacters(result);
    } catch (err) {
      setRosterError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoadingRoster(false);
    }
  }, []);

  useEffect(() => { if (session) refreshRoster(session); }, [session, refreshRoster]);

  const logout = useCallback(async () => {
    if (session) await revokeSessionToken(session.token);
    saveSession(null); setSession(null); setCharacters(null);
  }, [session]);

  if (!session) {
    return (
      <AuthForm onAuth={(s) => { saveSession(s); setSession(s); }} />
    );
  }

  if (creating) {
    return (
      <CreateCharacterForm
        session={session}
        existingNames={new Set((characters ?? []).map((c) => c.name.toLowerCase()))}
        onCancel={() => setCreating(false)}
        onCreated={() => { setCreating(false); refreshRoster(session); }}
      />
    );
  }

  return (
    <main className="start-screen">
      <section className="start-panel">
        <h1>VibeAge</h1>
        <div className="lobby-header">
          <small>Logged in as <strong>{session.login}</strong></small>
          <button type="button" className="ghost-button" onClick={logout}>Log out</button>
        </div>
        <h2 className="lobby-heading">Your Characters</h2>
        {loadingRoster && <p className="lobby-empty">Loading…</p>}
        {rosterError && <p className="lobby-error">{rosterError}</p>}
        {!loadingRoster && characters?.length === 0 && (
          <p className="lobby-empty">No characters yet. Create one to begin.</p>
        )}
        <ul className="lobby-list">
          {(characters ?? []).map((c) => (
            <li key={c.name} className="lobby-card">
              <div className="lobby-card-main">
                <strong>{c.name}</strong>
                <small>{RACE_PROFILES[c.race]?.name ?? c.race} · {c.className}</small>
              </div>
              <div className="lobby-card-actions">
                <button type="button" onClick={() => onEnter(c, session)}>Enter World</button>
                <button
                  type="button"
                  className="lobby-card-delete"
                  onClick={async () => { await deleteCharacter(session.token, c.name); refreshRoster(session); }}
                  title="Delete character"
                >Delete</button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="lobby-create" onClick={() => setCreating(true)}>
          + Create New Character
        </button>
        <DeleteAccountButton session={session} onDeleted={logout} />
      </section>
    </main>
  );
}

function DeleteAccountButton({ session, onDeleted }: { session: LobbySession; onDeleted: () => void }) {
  // Two-step confirm: a single click arms the button into a final
  // "Really delete?" state for 5 seconds. Avoids accidental wipes
  // while staying keyboard-friendly (no modal trap).
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!armed || busy) return;
    const t = setTimeout(() => setArmed(false), 5_000);
    return () => clearTimeout(t);
  }, [armed, busy]);

  const onClick = async () => {
    if (!armed) { setArmed(true); setError(null); return; }
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) { setError(`Delete failed (${res.status})`); setArmed(false); return; }
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setArmed(false);
    } finally {
      setBusy(false);
    }
  };

  const label = busy ? 'Deleting…'
    : armed ? 'Click again to confirm — deletes account + all characters'
    : 'Delete account';
  return (
    <>
      <button
        type="button"
        disabled={busy}
        className={armed ? 'lobby-delete-account lobby-delete-account--armed' : 'lobby-delete-account'}
        onClick={onClick}
        title="Delete this account and every character on it"
      >{label}</button>
      {error && <small className="lobby-error" role="alert">{error}</small>}
    </>
  );
}

function AuthForm({ onAuth }: { onAuth: (s: LobbySession) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // PR T — after a successful auth, hand off to the parent on the
  // next paint instead of inline. The inputs unmount first (because
  // `pendingSession` makes us render the "Entering…" placeholder),
  // so password-manager extensions like KeePassXC-Browser can't keep
  // their overlay icon anchored to the now-stale field position.
  const [pendingSession, setPendingSession] = useState<LobbySession | null>(null);

  useEffect(() => {
    if (!pendingSession) return;
    const handle = requestAnimationFrame(() => onAuth(pendingSession));
    return () => cancelAnimationFrame(handle);
  }, [pendingSession, onAuth]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });
      const body = (await res.json().catch(() => ({}))) as { token?: string; login?: string; error?: string };
      if (!res.ok || !body.token) {
        setError(humanReadableAuthError(body.error, res.status));
        return;
      }
      (document.activeElement as HTMLElement | null)?.blur?.();
      setPassword('');
      setLogin('');
      setPendingSession({ token: body.token, login: body.login ?? login });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  // Render nothing-with-form once auth succeeded — the password
  // input is gone from the DOM by the time the parent route flips.
  if (pendingSession) {
    return (
      <main className="start-screen">
        <section className="start-panel"><h1>VibeAge</h1><p className="lobby-note">Entering…</p></section>
      </main>
    );
  }

  return (
    <main className="start-screen">
      <form className="start-panel" onSubmit={submit}>
        <h1>VibeAge</h1>
        <p className="lobby-note">
          New login? You'll be registered. Returning? You'll be logged in.
        </p>
        <label htmlFor="login-input">Login</label>
        <input
          id="login-input"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          name="vibeage-login"
        />
        <label htmlFor="password-input">Password</label>
        <input
          id="password-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          name="vibeage-password"
        />
        {error && <small className="lobby-error">{error}</small>}
        <button type="submit" disabled={busy || !login || !password}>
          {busy ? '…' : 'Continue'}
        </button>
      </form>
    </main>
  );
}

function CreateCharacterForm({
  session,
  existingNames,
  onCancel,
  onCreated,
}: {
  session: LobbySession;
  existingNames: Set<string>;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [race, setRace] = useState<CharacterRace>('human');
  const allowed = RACE_PROFILES[race]?.allowedClasses ?? [];
  const [className, setClassName] = useState<CharacterClass>(allowed[0] ?? 'mage');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const conflict = trimmed.length > 0 && existingNames.has(trimmed.toLowerCase());
  const valid = trimmed.length > 0 && !conflict && allowed.includes(className);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account/characters', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ name: trimmed, race, className }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? `Create failed (${res.status})`);
        return;
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="start-screen">
      <form className="start-panel start-panel-character" onSubmit={submit}>
        <h1>Create Character</h1>
        <label htmlFor="player-name">Character Name</label>
        <input id="player-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your character name" autoComplete="off" />
        {conflict && <small className="lobby-error">Name already taken locally.</small>}
        <RaceClassPicker race={race} className={className} onRace={setRace} onClassName={setClassName} />
        {error && <small className="lobby-error">{error}</small>}
        <div className="lobby-form-actions">
          <button type="button" onClick={onCancel}>Back to Lobby</button>
          <button type="submit" disabled={!valid || busy}>{busy ? '…' : 'Create'}</button>
        </div>
      </form>
    </main>
  );
}
