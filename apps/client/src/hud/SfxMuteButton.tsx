import { useEffect, useState } from 'react';
import { setMuted } from '../sfx';

const STORAGE_KEY = 'vibeage.sfx.muted';

function loadStoredMute(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

/**
 * Tiny top-right mute toggle. Persists to localStorage so the
 * choice survives reload. Calls `setMuted` on every change so the
 * shared sfx module honours it immediately.
 *
 * Default: SFX on (storage value '0' / unset). Players who don't
 * want audio can mute once; the state sticks.
 */
export function SfxMuteButton() {
  const [muted, setMutedState] = useState(loadStoredMute);
  useEffect(() => {
    setMuted(muted);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    }
  }, [muted]);
  return (
    <button
      type="button"
      className="sfx-mute-button"
      aria-pressed={muted}
      aria-label={muted ? 'Unmute SFX' : 'Mute SFX'}
      title={muted ? 'SFX muted — click to enable' : 'SFX on — click to mute'}
      onClick={() => setMutedState((m) => !m)}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
