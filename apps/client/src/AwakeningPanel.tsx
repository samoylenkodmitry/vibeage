import { FormEvent, useState } from 'react';
import { RaceClassPicker } from './RaceClassPicker';
import { authenticate, type LobbySession, type SavedCharacter } from './accountSession';
import { becomeCharacter, firstAllowedClass, isValidIdentityName } from './onboarding';
import { HeroRoster } from './HeroRoster';
import type { CharacterClass } from '../../../packages/content/classes';
import type { CharacterRace } from '../../../packages/content/races';

/**
 * The one in-world identity surface — no web screens, ever. It renders both as
 * a full pre-connection screen (its own backdrop) and as an overlay above the
 * live world.
 *
 * - No session → "Become" a brand-new hero, or "Return" (log in) to an account.
 * - A session (just logged in, opened by a real hero, or a remembered account
 *   that hasn't picked a hero) → the hero roster: enter / switch / create /
 *   delete / log out / delete account.
 *
 * `onClose` is provided only when there's a world to go back to (the overlay
 * case); omitted, the ✕ is hidden. `onLogout` clears the session and drops the
 * player back to a Nameless guest.
 */
export function AwakeningPanel({
  initialSession = null,
  onEnter,
  onClose,
  onLogout,
}: {
  initialSession?: LobbySession | null;
  onEnter: (character: SavedCharacter, session: LobbySession) => void;
  onClose?: () => void;
  onLogout: () => void;
}) {
  const [session, setSession] = useState<LobbySession | null>(initialSession);
  const [mode, setMode] = useState<'become' | 'return'>('become');

  return (
    <div className="awakening-overlay" role="dialog" aria-modal="true" aria-label="Heroes & account">
      <section className="start-panel awakening-panel">
        <header className="awakening-header">
          <h1>{session ? 'Your Heroes' : 'The Awakening'}</h1>
          {onClose && (
            <button type="button" className="ghost-button awakening-close" onClick={onClose} aria-label="Back to the world">✕</button>
          )}
        </header>
        {session ? (
          <HeroRoster session={session} onEnter={onEnter} onLogout={() => { setSession(null); onLogout(); }} />
        ) : (
          <>
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
            {mode === 'become' ? <BecomeForm onEnter={onEnter} /> : <ReturnForm onAuthed={setSession} />}
          </>
        )}
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

function ReturnForm({ onAuthed }: { onAuthed: (session: LobbySession) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    // Hand the session up — the panel switches to the hero roster.
    onAuthed(auth.session);
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
