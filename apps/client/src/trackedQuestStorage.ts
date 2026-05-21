/**
 * §52 playtest follow-up — persist the player's QuestPanel selection
 * across reloads so the heads-up `QuestTrackerStrip` doesn't snap
 * back to the first-active default on every refresh.
 *
 * Stored under `vibeage.trackedQuest.v1` so the version suffix lets
 * us bump if the shape ever changes. Wrapped in try/catch because
 * private-browsing modes throw on `setItem`.
 */
import { useEffect } from 'react';

const STORAGE_KEY = 'vibeage.trackedQuest.v1';

export function loadTrackedQuestId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function saveTrackedQuestId(questId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (questId) window.localStorage.setItem(STORAGE_KEY, questId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private-browsing or quota — best-effort */
  }
}

/**
 * Rehydrate the tracked-quest selection once at mount via the
 * supplied dispatcher. Extracted so App.tsx stays under the
 * maintainability per-function line budget.
 */
export function useRehydrateTrackedQuest(setTrackedQuest: (id: string | null) => void): void {
  useEffect(() => {
    const stored = loadTrackedQuestId();
    if (stored) setTrackedQuest(stored);
  }, [setTrackedQuest]);
}
