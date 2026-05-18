import { FormEvent, useEffect, useState } from 'react';
import { CLASS_SKILL_TREES, type CharacterClass } from '../../../packages/content/classes';
import { CHARACTER_RACES, RACE_PROFILES, type CharacterRace } from '../../../packages/content/races';

/**
 * Pre-game lobby. Loads the player's saved characters from
 * localStorage, lets them pick one + Enter the World, or kick off
 * the Create-New-Character flow (race -> class -> save).
 *
 * Persistence is browser-local for now (no auth). The race + class
 * pick flows to the server in the join handshake so a brand-new
 * character is spawned with the chosen identity instead of relying
 * on a post-join SelectRace/SelectClass dance.
 */
export type SavedCharacter = {
  name: string;
  race: CharacterRace;
  className: CharacterClass;
  createdAtMs: number;
};

const STORAGE_KEY = 'vibeage:characters';

function loadCharacters(): SavedCharacter[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is SavedCharacter =>
      typeof c?.name === 'string'
      && CHARACTER_RACES.includes(c.race)
      && typeof c?.className === 'string'
      && CLASS_SKILL_TREES[c.className as CharacterClass] !== undefined,
    );
  } catch {
    return [];
  }
}

function saveCharacters(chars: SavedCharacter[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chars));
  } catch {
    // Ignore quota errors etc. — persistence is best-effort.
  }
}

export function Lobby({
  onEnter,
}: {
  onEnter: (character: SavedCharacter) => void;
}) {
  const [characters, setCharacters] = useState<SavedCharacter[]>(() => loadCharacters());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    saveCharacters(characters);
  }, [characters]);

  if (creating) {
    return (
      <CreateCharacterForm
        existingNames={new Set(characters.map((c) => c.name.toLowerCase()))}
        onCancel={() => setCreating(false)}
        onCreate={(c) => {
          // Save the new character and drop back to the lobby. The
          // user explicitly picks Enter on the card when ready —
          // avoids the auto-enter surprise after the create flow.
          setCharacters([...characters, c]);
          setCreating(false);
        }}
      />
    );
  }

  return (
    <main className="start-screen">
      <section className="start-panel">
        <h1>VibeAge</h1>
        <h2 className="lobby-heading">Your Characters</h2>
        {characters.length === 0 && (
          <p className="lobby-empty">No characters yet. Create one to begin.</p>
        )}
        <ul className="lobby-list">
          {characters.map((c) => (
            <li key={c.name} className="lobby-card">
              <div className="lobby-card-main">
                <strong>{c.name}</strong>
                <small>{RACE_PROFILES[c.race]?.name ?? c.race} · {c.className}</small>
              </div>
              <div className="lobby-card-actions">
                <button type="button" onClick={() => onEnter(c)}>Enter World</button>
                <button
                  type="button"
                  className="lobby-card-delete"
                  onClick={() => setCharacters(characters.filter((other) => other.name !== c.name))}
                  title="Delete character (local only)"
                >Delete</button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="lobby-create" onClick={() => setCreating(true)}>
          + Create New Character
        </button>
        <small className="lobby-note">
          Characters are stored in this browser. Server-side multi-character accounts ship with auth (roadmap).
        </small>
      </section>
    </main>
  );
}

function CreateCharacterForm({
  existingNames,
  onCancel,
  onCreate,
}: {
  existingNames: Set<string>;
  onCancel: () => void;
  onCreate: (c: SavedCharacter) => void;
}) {
  const [name, setName] = useState('');
  const [race, setRace] = useState<CharacterRace>('human');
  const allowed = RACE_PROFILES[race]?.allowedClasses ?? [];
  const [className, setClassName] = useState<CharacterClass>(allowed[0] ?? 'mage');

  useEffect(() => {
    // When race changes, snap class to one allowed for it.
    const next = RACE_PROFILES[race]?.allowedClasses ?? [];
    if (next.length > 0 && !next.includes(className)) {
      setClassName(next[0]);
    }
  }, [race, className]);

  const trimmed = name.trim();
  const conflict = trimmed.length > 0 && existingNames.has(trimmed.toLowerCase());
  const valid = trimmed.length > 0 && !conflict && allowed.includes(className);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    onCreate({ name: trimmed, race, className, createdAtMs: Date.now() });
  }

  return (
    <main className="start-screen">
      <form className="start-panel start-panel-character" onSubmit={submit}>
        <h1>Create Character</h1>
        <label htmlFor="player-name">Character Name</label>
        <input
          id="player-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Enter your character name"
          autoComplete="off"
        />
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
                <input
                  type="radio"
                  name="className"
                  value={option}
                  checked={className === option}
                  onChange={() => setClassName(option)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
          <small className="character-blurb">{CLASS_SKILL_TREES[className]?.description ?? ''}</small>
        </fieldset>
        <div className="lobby-form-actions">
          <button type="button" onClick={onCancel}>Back to Lobby</button>
          <button type="submit" disabled={!valid}>Create &amp; Enter</button>
        </div>
      </form>
    </main>
  );
}
