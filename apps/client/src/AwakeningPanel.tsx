import { FormEvent, useState } from 'react';
import { RACE_PROFILES, type CharacterRace } from '../../../packages/content/races';
import type { CharacterClass } from '../../../packages/content/classes';
import { RaceClassPicker } from './RaceClassPicker';
import { authenticate, fetchRoster, type LobbySession, type SavedCharacter } from './accountSession';
import { becomeCharacter, firstAllowedClass, isValidIdentityName } from './onboarding';

/**
 * In-world onboarding. The Nameless guest opens this over the live 3D world
 * (never a separate web screen) to either "Become" a brand-new hero — pick
 * race → prophecy(class) → name, set a login so the hero is saved — or
 * "Return" to a hero already on an account. On success the panel hands the
 * chosen character + session up to App, which `connect()`s as that hero and
 * drops the guest. All endpoints are the same ones the lobby uses.
 */
export function AwakeningPanel({
  onEnter,
  onClose,
}: {
  onEnter: (character: SavedCharacter, session: LobbySession) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'become' | 'return'>('become');
  return (
    <div className="awakening-overlay" role="dialog" aria-modal="true" aria-label="The Awakening">
      <section className="start-panel awakening-panel">
        <header className="awakening-header">
          <h1>The Awakening</h1>
          <button type="button" className="ghost-button awakening-close" onClick={onClose} aria-label="Back to the world">✕</button>
        </header>
        <p className="lobby-note">
          You walk the world as the Nameless. Choose your fate — or return to a hero you already are.
        </p>
        <div className="awakening-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'become'}
            className={mode === 'become' ? 'awakening-tab awakening-tab--active' : 'awakening-tab'}
            onClick={() => setMode('become')}
          >Become someone new</button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'return'}
            className={mode === 'return' ? 'awakening-tab awakening-tab--active' : 'awakening-tab'}
            onClick={() => setMode('return')}
          >Return to a hero</button>
        </div>
        {mode === 'become' ? <BecomeForm onEnter={onEnter} /> : <ReturnForm onEnter={onEnter} />}
      </section>
    </div>
  );
}

function BecomeForm({ onEnter }: { onEnter: (character: SavedCharacter, session: LobbySession) => void }) {
  const [name, setName] = useState('');
  const [race, setRace] = useState<CharacterRace>('human');
  const [className, setClassName] = useState<CharacterClass>(firstAllowedClass('human'));
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValid = isValidIdentityName(name);
  const valid = nameValid && login.length > 0 && password.length > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await becomeCharacter({ login, password, name, race, className });
    if (!outcome.ok) {
      setError(outcome.error);
      setBusy(false);
      return;
    }
    // onEnter reconnects as the new hero and unmounts the panel, so we
    // deliberately leave `busy` set — the inputs vanish before the next paint.
    onEnter(outcome.character, outcome.session);
  }

  return (
    <form className="awakening-form" onSubmit={submit}>
      <label htmlFor="awaken-name">True name</label>
      <input id="awaken-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your hero" autoComplete="off" />
      {name.length > 0 && !nameValid && (
        <small className="lobby-error">Letters, digits, ".", "_", "-" only (max 24).</small>
      )}
      <RaceClassPicker race={race} className={className} onRace={setRace} onClassName={setClassName} />
      <fieldset className="character-fieldset">
        <legend>Your account</legend>
        <p className="lobby-note awakening-credential-note">
          So you can return to this hero later. New login? You'll be registered.
        </p>
        <label htmlFor="awaken-login">Login</label>
        <input id="awaken-login" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" name="vibeage-login" />
        <label htmlFor="awaken-password">Password</label>
        <input id="awaken-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" name="vibeage-password" />
      </fieldset>
      {error && <small className="lobby-error" role="alert">{error}</small>}
      <button type="submit" className="awaken-submit" disabled={!valid || busy}>
        {busy ? 'Awakening…' : 'Awaken'}
      </button>
    </form>
  );
}

function ReturnForm({ onEnter }: { onEnter: (character: SavedCharacter, session: LobbySession) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<LobbySession | null>(null);
  const [characters, setCharacters] = useState<SavedCharacter[] | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !login || !password) return;
    setBusy(true);
    setError(null);
    const auth = await authenticate(login, password);
    if (!auth.ok || !auth.session) {
      setError(auth.error ?? 'Authentication failed');
      setBusy(false);
      return;
    }
    try {
      const roster = await fetchRoster(auth.session.token);
      if (roster === 'unauthorized') {
        setError('That session expired — try again.');
        return;
      }
      setSession(auth.session);
      setCharacters(roster);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  if (session && characters) {
    return (
      <div className="awakening-roster">
        {characters.length === 0 && (
          <p className="lobby-empty">No heroes on this account yet. Use “Become someone new”.</p>
        )}
        <ul className="lobby-list">
          {characters.map((c) => (
            <li key={c.name} className="lobby-card">
              <div className="lobby-card-main">
                <strong>{c.name}</strong>
                <small>{RACE_PROFILES[c.race]?.name ?? c.race} · {c.className}</small>
              </div>
              <div className="lobby-card-actions">
                <button type="button" onClick={() => onEnter(c, session)}>Enter as this hero</button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="ghost-button" onClick={() => { setSession(null); setCharacters(null); }}>
          Use a different login
        </button>
      </div>
    );
  }

  return (
    <form className="awakening-form" onSubmit={submit}>
      <label htmlFor="return-login">Login</label>
      <input id="return-login" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" name="vibeage-login" />
      <label htmlFor="return-password">Password</label>
      <input id="return-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" name="vibeage-password" />
      {error && <small className="lobby-error" role="alert">{error}</small>}
      <button type="submit" disabled={busy || !login || !password}>{busy ? '…' : 'Continue'}</button>
    </form>
  );
}
