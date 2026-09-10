import { FormEvent, useEffect, useState } from 'react';
import { RaceClassPicker } from './RaceClassPicker';
import { authenticate, type LobbySession, type SavedCharacter } from './accountSession';
import { firstAllowedClass, isValidIdentityName, type BecomeInput } from './onboarding';
import { HeroRoster } from './HeroRoster';
import type { CharacterClass } from '../../../packages/content/classes';
import type { CharacterRace } from '../../../packages/content/races';

/**
 * The one in-world identity surface — no web screens, ever. It only ever opens
 * over a live, playable world, in response to the player clicking the identity
 * cue; it is never a gate on the way in.
 *
 * - No session → "Become" a brand-new hero, or "Return" (log in) to an account.
 * - A session (just logged in, opened by a real hero, or a remembered account
 *   that hasn't picked a hero) → the hero roster: enter / switch / create /
 *   delete / log out / delete account.
 *
 * Because there is always a world behind it, it is always dismissible: the ✕,
 * Escape, or "keep playing as the Nameless" all put the player back in the
 * game with nothing answered. `initialMode` picks the opening tab — a player
 * returning after their session expired lands on "Return", not "Become".
 * `onLogout` clears the session and drops the player back to a Nameless guest.
 */
export function AwakeningPanel({
  initialSession = null,
  initialMode = 'become',
  onEnter,
  onBecome,
  onClose,
  onLogout,
}: {
  initialSession?: LobbySession | null;
  initialMode?: 'become' | 'return';
  onEnter: (character: SavedCharacter, session: LobbySession) => void;
  onBecome: (input: BecomeInput) => Promise<{ ok: boolean; error?: string }>;
  onClose?: () => void;
  onLogout: () => void;
}) {
  const [session, setSession] = useState<LobbySession | null>(initialSession);
  const [mode, setMode] = useState<'become' | 'return'>(initialMode);
  useCloseOnEscape(onClose);

  return (
    <div className="awakening-overlay" role="dialog" aria-label="Heroes & account">
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
              Play and explore freely as the Nameless — when you Awaken, everything you've done so
              far carries into your new hero. Or return to a hero you already have. Nothing here is
              required: close this and keep playing whenever you like.
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
            {mode === 'become' ? <BecomeForm onBecome={onBecome} /> : <ReturnForm onAuthed={setSession} />}
          </>
        )}
        {onClose && (
          <button type="button" className="ghost-button awakening-dismiss" onClick={onClose}>
            ← Keep playing as the Nameless
          </button>
        )}
      </section>
    </div>
  );
}

/**
 * Escape closes the panel. Part of the "never a wall" contract: whatever the
 * player opened, one key puts them back in the world with nothing answered.
 */
function useCloseOnEscape(onClose?: () => void): void {
  useEffect(() => {
    if (!onClose) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

function BecomeForm({ onBecome }: { onBecome: (input: BecomeInput) => Promise<{ ok: boolean; error?: string }> }) {
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
    try {
      const result = await onBecome({ login, password, name, race, className });
      if (!result.ok) {
        setError(result.error ?? 'Could not awaken — try again.');
        setBusy(false);
        return;
      }
      // Success: the live guest becomes this hero in place (no reconnect), the
      // session is saved, and the panel unmounts — leave `busy` set.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not awaken — try again.');
      setBusy(false);
    }
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
