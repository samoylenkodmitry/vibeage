import { useEffect, useRef } from 'react';
import { playCue } from '../audio/cues';
import type { GameClientState } from '../gameTypes';

type BossTelegraphCueProps = {
  telegraphs: GameClientState['bossTelegraphs'];
};

const COOLDOWN_MS = 200;

/**
 * Fires the 'bossTelegraph' SFX cue whenever a new entry appears
 * in state.bossTelegraphs (keyed by enemyId + startedAt so a fresh
 * channel from the same boss still triggers). Self-prunes the
 * seen-set when the underlying telegraph drops out, so a re-entry
 * after the impact resolves re-arms the cue.
 *
 * Headless — pure side-effect, no DOM. Sits alongside the other
 * cue bridges in the HUD layer where game state already flows.
 */
export function BossTelegraphCue({ telegraphs }: BossTelegraphCueProps) {
  const seenRef = useRef<Set<string>>(new Set());
  const lastCueAtRef = useRef(0);

  useEffect(() => {
    const now = performance.now();
    const live = new Set<string>();
    for (const t of telegraphs) {
      const key = `${t.enemyId}:${t.startedAt}`;
      live.add(key);
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      if (now - lastCueAtRef.current > COOLDOWN_MS) {
        playCue('bossTelegraph');
        lastCueAtRef.current = now;
      }
    }
    // Prune expired keys so a re-trigger after impact re-arms.
    for (const key of seenRef.current) {
      if (!live.has(key)) seenRef.current.delete(key);
    }
  }, [telegraphs]);

  return null;
}
