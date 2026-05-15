export const DEFAULT_DAY_DURATION_MS = 12 * 60 * 1000;

export type DayPhaseLabel = 'dawn' | 'day' | 'dusk' | 'night';

export const DAY_PHASE_LABELS: readonly DayPhaseLabel[] = ['dawn', 'day', 'dusk', 'night'];

const PHASE_THRESHOLDS: Record<DayPhaseLabel, [number, number]> = {
  dawn: [0.0, 0.15],
  day: [0.15, 0.55],
  dusk: [0.55, 0.8],
  night: [0.8, 1.0],
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
