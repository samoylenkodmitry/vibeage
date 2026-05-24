import { useEffect, useState } from 'react';
import { setMuted, setVolume } from '../sfx';
import { openKeybindCheatsheet } from './keybindBus';

const MUTE_STORAGE_KEY = 'vibeage.sfx.muted';
const VOLUME_STORAGE_KEY = 'vibeage.sfx.volume';
const HELP_SEEN_KEY = 'vibeage.help.seen';

function loadHelpSeen(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(HELP_SEEN_KEY) === '1'; } catch { return true; }
}

function loadStoredMute(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
}

function loadStoredVolume(): number {
  if (typeof window === 'undefined') return 1;
  const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
  if (raw === null) return 1;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}

/**
 * Top-right SFX controls: mute toggle + volume slider.
 *
 * The slider reveals on focus / hover so the chrome stays tiny
 * during gameplay. Both values persist to localStorage so the
 * choice survives reload. The mute button shows three icons —
 * muted, low-volume, full — so the player has a glanceable
 * indicator of current state.
 */
export function SfxMuteButton() {
  const [muted, setMutedState] = useState(loadStoredMute);
  const [volume, setVolumeState] = useState(loadStoredVolume);
  const [helpSeen, setHelpSeen] = useState(loadHelpSeen);
  const markHelpSeen = () => {
    setHelpSeen(true);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(HELP_SEEN_KEY, '1'); } catch { /* ignore */ }
    }
  };

  useEffect(() => {
    setMuted(muted);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
    }
  }, [muted]);

  useEffect(() => {
    setVolume(volume);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
    }
  }, [volume]);

  const icon = muted ? '🔇' : volume < 0.34 ? '🔈' : volume < 0.67 ? '🔉' : '🔊';
  const title = muted
    ? 'SFX muted — click to enable'
    : `SFX volume ${Math.round(volume * 100)}% — click to mute`;

  return (
    <div className="sfx-controls">
      <button
        type="button"
        className={`sfx-mute-button${helpSeen ? '' : ' sfx-mute-button--unseen'}`}
        aria-label="Open keybind cheatsheet"
        title="Keybinds (H or ?)"
        onClick={() => { markHelpSeen(); openKeybindCheatsheet(); }}
      >
        ?
      </button>
      <button
        type="button"
        className="sfx-mute-button"
        aria-pressed={muted}
        aria-label={muted ? 'Unmute SFX' : 'Mute SFX'}
        title={title}
        onClick={() => setMutedState((m) => !m)}
      >
        {icon}
      </button>
      <input
        type="range"
        className="sfx-volume-slider"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        disabled={muted}
        aria-label="SFX volume"
        title={`SFX volume ${Math.round(volume * 100)}%`}
        onChange={(e) => setVolumeState(Number(e.target.value))}
      />
    </div>
  );
}
