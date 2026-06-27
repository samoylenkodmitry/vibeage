import { FormEvent, useCallback, useEffect, useState } from 'react';
import { RACE_PROFILES, type CharacterRace } from '../../../packages/content/races';
import type { CharacterClass } from '../../../packages/content/classes';
import { RaceClassPicker } from './RaceClassPicker';
import {
  createCharacter,
  deleteCharacter,
  fetchRoster,
  revokeSessionToken,
  type LobbySession,
  type SavedCharacter,
} from './accountSession';
import { firstAllowedClass, isValidIdentityName } from './onboarding';

/**
 * Authenticated in-world identity view — the Lobby's roster + account
 * management, moved inside the world. Pick a hero to enter/switch, create a new
 * one, delete one, log out, or delete the whole account. No web screen.
 */
export function HeroRoster({
  session,
  onEnter,
  onLogout,
}: {
  session: LobbySession;
  onEnter: (character: SavedCharacter, session: LobbySession) => void;
  onLogout: () => void;
}) {
  const [characters, setCharacters] = useState<SavedCharacter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const roster = await fetchRoster(session.token);
      if (roster === 'unauthorized') {
        onLogout();
        return;
      }
      setCharacters(roster);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }, [session.token, onLogout]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (creating) {
    return (
      <CreateHeroForm
        session={session}
        existingNames={new Set((characters ?? []).map((c) => c.name.toLowerCase()))}
        onCancel={() => setCreating(false)}
        onCreated={() => { setCreating(false); void refresh(); }}
      />
    );
  }

  return (
    <div className="awakening-roster">
      <p className="lobby-note">Logged in as <strong>{session.login}</strong></p>
      {error && <small className="lobby-error" role="alert">{error}</small>}
      {characters?.length === 0 && <p className="lobby-empty">No heroes yet. Create one to begin.</p>}
      <ul className="lobby-list">
        {(characters ?? []).map((c) => (
          <li key={c.name} className="lobby-card">
            <div className="lobby-card-main">
              <strong>{c.name}</strong>
              <small>{RACE_PROFILES[c.race]?.name ?? c.race} · {c.className}</small>
            </div>
            <div className="lobby-card-actions">
              <button type="button" onClick={() => onEnter(c, session)}>Enter</button>
              <button
                type="button"
                className="lobby-card-delete"
                onClick={async () => { await deleteCharacter(session.token, c.name); void refresh(); }}
                title="Delete hero"
              >Delete</button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="lobby-create" onClick={() => setCreating(true)}>+ Create New Hero</button>
      <div className="awakening-account-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={async () => { await revokeSessionToken(session.token); onLogout(); }}
        >Log out</button>
        <DeleteAccountButton session={session} onDeleted={onLogout} />
      </div>
    </div>
  );
}

function CreateHeroForm({
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
  const [className, setClassName] = useState<CharacterClass>(firstAllowedClass('human'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const conflict = trimmed.length > 0 && existingNames.has(trimmed.toLowerCase());
  const valid = isValidIdentityName(name) && !conflict;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const created = await createCharacter(session.token, { name: trimmed, race, className });
    if (!created.ok) {
      setError(created.error);
      setBusy(false);
      return;
    }
    onCreated();
  }

  return (
    <form className="awakening-form" onSubmit={submit}>
      <label htmlFor="hero-name">Hero name</label>
      <input id="hero-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your hero" autoComplete="off" />
      {conflict && <small className="lobby-error">You already have a hero with that name.</small>}
      <RaceClassPicker race={race} className={className} onRace={setRace} onClassName={setClassName} />
      {error && <small className="lobby-error" role="alert">{error}</small>}
      <div className="lobby-form-actions">
        <button type="button" onClick={onCancel}>Back</button>
        <button type="submit" disabled={!valid || busy}>{busy ? '…' : 'Create'}</button>
      </div>
    </form>
  );
}

function DeleteAccountButton({ session, onDeleted }: { session: LobbySession; onDeleted: () => void }) {
  // Two-step confirm: a single click arms the button into a final "Really
  // delete?" state for 5 seconds. Avoids accidental wipes (account + every
  // hero) while staying keyboard-friendly (no modal trap).
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
    setBusy(true);
    setError(null);
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
    : armed ? 'Click again — deletes account + all heroes'
    : 'Delete account';
  return (
    <>
      <button
        type="button"
        disabled={busy}
        className={armed ? 'lobby-delete-account lobby-delete-account--armed' : 'lobby-delete-account'}
        onClick={onClick}
        title="Delete this account and every hero on it"
      >{label}</button>
      {error && <small className="lobby-error" role="alert">{error}</small>}
    </>
  );
}
