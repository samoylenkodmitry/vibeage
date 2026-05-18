// Full day/night cycle. Bumped from 12 → 18 min so each phase has more
// wall-clock to play out — combined with the day-heavy thresholds
// below, a player spends ~11 min in dawn+day vs ~7 in dusk+night per
// cycle (was ~6.6 / ~5.4 at 12 min total).
export const DEFAULT_DAY_DURATION_MS = 18 * 60 * 1000;

export type DayPhaseLabel = 'dawn' | 'day' | 'dusk' | 'night';

export const DAY_PHASE_LABELS: readonly DayPhaseLabel[] = ['dawn', 'day', 'dusk', 'night'];

// Phase ratios (sum to 1):
//   dawn 10% + day 50% + dusk 25% + night 15%  → daytime 60%, nighttime 15%.
// (Previous mix was dawn 15% + day 40% + dusk 25% + night 20%.)
// Night is short because night-restricted enemies and the cosmetic
// dark-mode are intended as a flavour change, not the main play state.
const PHASE_THRESHOLDS: Record<DayPhaseLabel, [number, number]> = {
  dawn: [0.0, 0.10],
  day: [0.10, 0.60],
  dusk: [0.60, 0.85],
  night: [0.85, 1.0],
};

export function normalizePhase(
  timestampMs: number,
  dayDurationMs: number = DEFAULT_DAY_DURATION_MS,
): number {
  const safe = Number.isFinite(timestampMs) && dayDurationMs > 0 ? timestampMs : 0;
  const cycle = safe / dayDurationMs;
  const wrapped = cycle - Math.floor(cycle);
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

export function dayPhaseLabel(
  timestampMs: number,
  dayDurationMs: number = DEFAULT_DAY_DURATION_MS,
): DayPhaseLabel {
  const phase = normalizePhase(timestampMs, dayDurationMs);
  for (const label of DAY_PHASE_LABELS) {
    const [start, end] = PHASE_THRESHOLDS[label];
    if (phase >= start && phase < end) {
      return label;
    }
  }
  return 'night';
}

export function isMobAllowedInPhase(
  activePhases: readonly DayPhaseLabel[] | undefined,
  currentPhase: DayPhaseLabel,
): boolean {
  if (!activePhases || activePhases.length === 0) {
    return true;
  }
  return activePhases.includes(currentPhase);
}
