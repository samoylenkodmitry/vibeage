import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  CLASS_DIFFICULTY,
  CLASS_SKILL_TREES,
  getStarterSkillForClass,
  type CharacterClass,
} from '../../../packages/content/classes';
import { CHARACTER_RACES, RACE_PROFILES, type CharacterRace } from '../../../packages/content/races';
import { SKILLS } from '../../../packages/content/skills';

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
 */
export type SavedCharacter = {
  name: string;
  race: CharacterRace;
  className: CharacterClass;
};

export type LobbySession = { token: string; login: string };

const SESSION_KEY = 'vibeage:session';

function loadSession(): LobbySession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token === 'string' && typeof parsed?.login === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveSession(s: LobbySession | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch { /* best-effort */ }
}

async function revokeSessionToken(token: string): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  } catch { /* swallow — local clear still runs */ }
}

async function deleteCharacter(token: string, name: string): Promise<void> {
  await fetch(`/api/account/characters/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
}

async function fetchRoster(token: string): Promise<SavedCharacter[] | 'unauthorized'> {
  const res = await fetch('/api/account/characters', {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) return 'unauthorized';
  if (!res.ok) throw new Error(`Roster fetch failed: ${res.status}`);
  const body = (await res.json()) as { characters: Array<{ name: string; race: string; class_name: string }> };
  return body.characters.map((c) => ({
    name: c.name,
    race: c.race as CharacterRace,
    className: c.class_name as CharacterClass,
  }));
}

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

function humanReadableAuthError(code: string | undefined, status: number): string {
  switch (code) {
    case 'wrongCredentials': return 'Wrong password for this login.';
    case 'invalidLogin': return 'Login may only contain letters, digits, ".", "_", "-" (max 24 chars).';
    case 'invalidPassword': return 'Password is too long (max 128 chars).';
    default: return `Auth failed (${status})`;
  }
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

  useEffect(() => {
    const next = RACE_PROFILES[race]?.allowedClasses ?? [];
    if (next.length > 0 && !next.includes(className)) setClassName(next[0]);
  }, [race, className]);

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
        <fieldset className="character-fieldset">
          <legend>Race</legend>
          <div className="character-grid">
            {CHARACTER_RACES.map((option) => (
              <label key={option} className={`character-option${race === option ? ' character-option--active' : ''}`}>
                <input type="radio" name="race" value={option} checked={race === option} onChange={() => setRace(option)} />
                <span>{RACE_PROFILES[option].name}</span>
              </label>
            ))}
          </div>
          <small className="character-blurb">{RACE_PROFILES[race]?.description ?? ''}</small>
        </fieldset>
        <fieldset className="character-fieldset">
          <legend>Class</legend>
          <div className="character-grid">
            {allowed.map((option) => (
              <label key={option} className={`character-option${className === option ? ' character-option--active' : ''}`}>
                <input type="radio" name="className" value={option} checked={className === option} onChange={() => setClassName(option)} />
                <span>{option}</span>
              </label>
            ))}
          </div>
          <small className="character-blurb">{CLASS_SKILL_TREES[className]?.description ?? ''}</small>
          <ClassDetail classKey={className} />
        </fieldset>
        {error && <small className="lobby-error">{error}</small>}
        <div className="lobby-form-actions">
          <button type="button" onClick={onCancel}>Back to Lobby</button>
          <button type="submit" disabled={!valid || busy}>{busy ? '…' : 'Create'}</button>
        </div>
      </form>
    </main>
  );
}

/**
 * §49/M2 — second-line detail under the class picker. Shows the
 * starter skill (so a fresh player knows what they'll press at
 * spawn) + a one-word difficulty hint. Kept separate from
 * \`character-blurb\` so the existing CSS layout stays intact and
 * the JSX block in CreateCharacterForm doesn't balloon.
 */
function ClassDetail({ classKey }: { classKey: CharacterClass }) {
  const starter = getStarterSkillForClass(classKey);
  const starterSkill = starter ? SKILLS[starter] : null;
  const difficulty = CLASS_DIFFICULTY[classKey];
  return (
    <div className="character-meta">
      {starterSkill && (
        <small className="character-meta-line">
          Starter: <strong>{starterSkill.name}</strong>
        </small>
      )}
      {difficulty && (
        <small className="character-meta-line">
          Difficulty: <strong>{difficulty}</strong>
        </small>
      )}
    </div>
  );
}
