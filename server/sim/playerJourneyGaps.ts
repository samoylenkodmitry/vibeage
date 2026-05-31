import { CLASS_SKILL_TREES, type CharacterClass } from '../../packages/content/classes.js';
import { SPECIALIZATIONS, type SpecializationId } from '../../packages/content/specializations.js';
import {
  journeyReportRows,
  type JourneyBeatKind,
  type PlayerJourneySummary,
} from './playerJourney.js';

const GAP_KIND_PRIORITY: Record<JourneyGapKind, number> = {
  empty_windows: 5,
  grind_only: 4,
  quest_gap: 3,
  gear_gap: 2,
  unlock_gap: 1,
  healthy_cadence: 0,
};

const SEVERITY_PRIORITY: Record<JourneyGapSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

type BeatGroup = {
  kind: Exclude<JourneyGapKind, 'empty_windows' | 'grind_only' | 'healthy_cadence'>;
  beatKinds: JourneyBeatKind[];
  minGapHours: (summary: PlayerJourneySummary) => number;
  detail: string;
  mitigation: string;
};

export type JourneyGapKind =
  | 'empty_windows'
  | 'quest_gap'
  | 'gear_gap'
  | 'unlock_gap'
  | 'grind_only'
  | 'healthy_cadence';

export type JourneyGapSeverity = 'low' | 'medium' | 'high';

export type JourneyGapDiagnostic = {
  pathLabel: string;
  className: CharacterClass;
  specializationId?: SpecializationId;
  horizonHours: number;
  endingLevel: number;
  levelBand: string;
  kind: JourneyGapKind;
  severity: JourneyGapSeverity;
  startHour: number;
  endHour: number;
  durationHours: number;
  emptyWindows: number;
  windowCount: number;
  detail: string;
  mitigation: string;
};

const BEAT_GROUPS: BeatGroup[] = [
  {
    kind: 'quest_gap',
    beatKinds: ['quest_available', 'quest_complete'],
    minGapHours: (summary) => Math.max(summary.windowHours * 2, 2),
    detail: 'No quest availability or completion beat inside the longest route gap.',
    mitigation: 'Add quest steps, breadcrumb objectives, or optional side quests in this level band.',
  },
  {
    kind: 'gear_gap',
    beatKinds: ['item_upgrade', 'vendor_purchase'],
    minGapHours: (summary) => Math.max(summary.windowHours * 4, 4),
    detail: 'No gear purchase or item upgrade beat inside the longest route gap.',
    mitigation: 'Add vendor stock, deterministic quest gear, crafting goals, or set-piece progress.',
  },
  {
    kind: 'unlock_gap',
    beatKinds: ['level', 'skill', 'specialization', 'proficiency'],
    minGapHours: (summary) => Math.max(summary.windowHours * 3, 3),
    detail: 'No level, skill, specialization, or proficiency beat inside the longest route gap.',
    mitigation: 'Add previewed unlock goals, mastery ranks, or smaller progression milestones.',
  },
];

export function diagnoseJourneyGaps(summary: PlayerJourneySummary): JourneyGapDiagnostic[] {
  const diagnostics = [
    ...emptyWindowDiagnostics(summary),
    ...beatGapDiagnostics(summary),
    grindOnlyDiagnostic(summary),
  ].filter((diagnostic): diagnostic is JourneyGapDiagnostic => Boolean(diagnostic));

  return diagnostics.sort(compareDiagnostics);
}

export function journeyGapDiagnostics(rows: readonly PlayerJourneySummary[] = journeyReportRows()): JourneyGapDiagnostic[] {
  return rows.flatMap((row) => diagnoseJourneyGaps(row));
}

export function journeyGapReportRows(rows: readonly PlayerJourneySummary[] = journeyReportRows()): JourneyGapDiagnostic[] {
  return rows.map((row) => diagnoseJourneyGaps(row)[0] ?? healthyCadenceDiagnostic(row));
}

export function journeyGapPathLabel(row: PlayerJourneySummary): string {
  if (row.requestedSpecializationId) return row.requestedSpecializationId;
  return row.chosenSpecializationId ? `${row.className} route (${row.chosenSpecializationId})` : `${row.className} route`;
}

function emptyWindowDiagnostics(summary: PlayerJourneySummary): JourneyGapDiagnostic[] {
  const diagnostics: JourneyGapDiagnostic[] = [];
  let streakStart = -1;
  let streakEnd = -1;
  let emptyWindows = 0;

  for (const window of summary.windows) {
    if (window.isEmpty) {
      if (streakStart < 0) streakStart = window.startHour;
      streakEnd = window.endHour;
      emptyWindows += 1;
      continue;
    }

    if (streakStart >= 0) {
      pushEmptyWindowDiagnostic(summary, diagnostics, streakStart, streakEnd, emptyWindows);
      streakStart = -1;
      streakEnd = -1;
      emptyWindows = 0;
    }
  }

  if (streakStart >= 0) {
    pushEmptyWindowDiagnostic(summary, diagnostics, streakStart, streakEnd, emptyWindows);
  }

  return diagnostics;
}

function pushEmptyWindowDiagnostic(
  summary: PlayerJourneySummary,
  diagnostics: JourneyGapDiagnostic[],
  startHour: number,
  endHour: number,
  emptyWindows: number,
): void {
  const durationHours = Math.max(0, endHour - startHour);
  if (durationHours < summary.windowHours) return;
  diagnostics.push(createDiagnostic(summary, {
    kind: 'empty_windows',
    startHour,
    endHour,
    emptyWindows,
    detail: `${emptyWindows} consecutive empty window${emptyWindows === 1 ? '' : 's'} with no meaningful beat.`,
    mitigation: 'Put at least one quest, unlock preview, gear goal, or set-piece progress beat inside this streak.',
  }));
}

function beatGapDiagnostics(summary: PlayerJourneySummary): JourneyGapDiagnostic[] {
  return BEAT_GROUPS
    .map((group) => {
      const gap = longestBeatGap(summary, group.beatKinds);
      if (gap.durationHours < group.minGapHours(summary)) return null;
      return createDiagnostic(summary, {
        kind: group.kind,
        startHour: gap.startHour,
        endHour: gap.endHour,
        emptyWindows: countEmptyWindows(summary, gap.startHour, gap.endHour),
        detail: group.detail,
        mitigation: group.mitigation,
      });
    })
    .filter((diagnostic): diagnostic is JourneyGapDiagnostic => Boolean(diagnostic));
}

function grindOnlyDiagnostic(summary: PlayerJourneySummary): JourneyGapDiagnostic | null {
  if (summary.kills <= 0) return null;
  const lastDirectedBeatHour = latestBeatHour(summary, [
    'quest_available',
    'quest_complete',
    'item_upgrade',
    'vendor_purchase',
    'skill',
    'specialization',
    'proficiency',
  ]);
  const durationHours = summary.horizonHours - lastDirectedBeatHour;
  if (durationHours < Math.max(summary.windowHours * 6, summary.horizonHours * 0.2)) return null;

  return createDiagnostic(summary, {
    kind: 'grind_only',
    startHour: lastDirectedBeatHour,
    endHour: summary.horizonHours,
    emptyWindows: countEmptyWindows(summary, lastDirectedBeatHour, summary.horizonHours),
    detail: 'Route continues after the last directed objective with only repeat combat modeled.',
    mitigation: 'Add a directed grind goal: bounty chain, reputation tier, crafting target, rare-boss hunt, or quest arc.',
  });
}

function healthyCadenceDiagnostic(summary: PlayerJourneySummary): JourneyGapDiagnostic {
  return createDiagnostic(summary, {
    kind: 'healthy_cadence',
    startHour: 0,
    endHour: 0,
    emptyWindows: 0,
    detail: 'No content gap exceeded the current advisory thresholds.',
    mitigation: 'Cadence is within current diagnostic targets.',
  });
}

function createDiagnostic(
  summary: PlayerJourneySummary,
  input: {
    kind: JourneyGapKind;
    startHour: number;
    endHour: number;
    emptyWindows: number;
    detail: string;
    mitigation: string;
  },
): JourneyGapDiagnostic {
  const startHour = clampHour(input.startHour, summary.horizonHours);
  const endHour = clampHour(Math.max(input.endHour, startHour), summary.horizonHours);
  const durationHours = endHour - startHour;
  return {
    pathLabel: journeyGapPathLabel(summary),
    className: summary.className,
    specializationId: summary.requestedSpecializationId,
    horizonHours: summary.horizonHours,
    endingLevel: summary.endingLevel,
    levelBand: levelBand(summary, startHour, endHour),
    kind: input.kind,
    severity: severityFor(summary, input.kind, durationHours, input.emptyWindows),
    startHour,
    endHour,
    durationHours,
    emptyWindows: input.emptyWindows,
    windowCount: summary.windows.length,
    detail: input.detail,
    mitigation: input.mitigation,
  };
}

function longestBeatGap(
  summary: PlayerJourneySummary,
  beatKinds: readonly JourneyBeatKind[],
): { startHour: number; endHour: number; durationHours: number } {
  const hours = summary.beats
    .filter((beat) => beat.weight > 0 && beatKinds.includes(beat.kind))
    .map((beat) => beat.atMs / (60 * 60 * 1000))
    .filter((hour) => hour >= 0 && hour <= summary.horizonHours)
    .sort((a, b) => a - b);

  let previous = 0;
  let best = { startHour: 0, endHour: hours[0] ?? summary.horizonHours };
  let bestDuration = best.endHour - best.startHour;

  for (const hour of hours) {
    const duration = hour - previous;
    if (duration > bestDuration) {
      best = { startHour: previous, endHour: hour };
      bestDuration = duration;
    }
    previous = hour;
  }

  const tailDuration = summary.horizonHours - previous;
  if (tailDuration > bestDuration) {
    best = { startHour: previous, endHour: summary.horizonHours };
    bestDuration = tailDuration;
  }

  return { ...best, durationHours: bestDuration };
}

function latestBeatHour(summary: PlayerJourneySummary, beatKinds: readonly JourneyBeatKind[]): number {
  return summary.beats
    .filter((beat) => beat.weight > 0 && beatKinds.includes(beat.kind))
    .map((beat) => beat.atMs / (60 * 60 * 1000))
    .filter((hour) => hour >= 0 && hour <= summary.horizonHours)
    .reduce((latest, hour) => Math.max(latest, hour), 0);
}

function countEmptyWindows(summary: PlayerJourneySummary, startHour: number, endHour: number): number {
  return summary.windows.filter((window) => (
    window.isEmpty
    && window.startHour >= startHour
    && window.endHour <= endHour
  )).length;
}

function severityFor(
  summary: PlayerJourneySummary,
  kind: JourneyGapKind,
  durationHours: number,
  emptyWindows: number,
): JourneyGapSeverity {
  if (kind === 'healthy_cadence') return 'low';
  const windowCount = Math.max(1, summary.windows.length);
  const emptyRatio = emptyWindows / windowCount;
  if (durationHours >= 12 || emptyWindows >= 8 || emptyRatio >= 0.35) return 'high';
  if (durationHours >= 4 || emptyWindows >= 2 || kind === 'grind_only') return 'medium';
  return 'low';
}

function levelBand(summary: PlayerJourneySummary, startHour: number, endHour: number): string {
  const startLevel = levelAtHour(summary, startHour);
  const endLevel = levelAtHour(summary, endHour);
  if (startLevel === endLevel) return `L${startLevel}`;
  return `L${startLevel}-L${endLevel}`;
}

function levelAtHour(summary: PlayerJourneySummary, hour: number): number {
  const startingLevel = Math.max(1, summary.endingLevel - summary.levelsGained);
  let level = startingLevel;
  for (const event of levelEvents(summary)) {
    if (event.hour > hour) break;
    level = event.level;
  }
  return level;
}

function levelEvents(summary: PlayerJourneySummary): Array<{ hour: number; level: number }> {
  return summary.beats
    .filter((beat) => beat.kind === 'level')
    .map((beat) => {
      const match = /Reached level (\d+)/.exec(beat.label);
      return match ? { hour: beat.atMs / (60 * 60 * 1000), level: Number(match[1]) } : null;
    })
    .filter((event): event is { hour: number; level: number } => Boolean(event))
    .sort((a, b) => a.hour - b.hour);
}

function compareDiagnostics(a: JourneyGapDiagnostic, b: JourneyGapDiagnostic): number {
  return (
    SEVERITY_PRIORITY[b.severity] - SEVERITY_PRIORITY[a.severity]
    || GAP_KIND_PRIORITY[b.kind] - GAP_KIND_PRIORITY[a.kind]
    || b.durationHours - a.durationHours
    || b.emptyWindows - a.emptyWindows
    || a.startHour - b.startHour
    || a.pathLabel.localeCompare(b.pathLabel)
  );
}

function clampHour(value: number, horizonHours: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(horizonHours, value));
}

export function expectedJourneyGapReportRowCount(): number {
  return Object.keys(CLASS_SKILL_TREES).length + Object.keys(SPECIALIZATIONS).length;
}
