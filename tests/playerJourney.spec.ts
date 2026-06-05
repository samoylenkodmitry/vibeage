import { describe, expect, it } from 'vitest';
import { CLASS_SKILL_TREES, type CharacterClass } from '../packages/content/classes';
import { SPECIALIZATIONS } from '../packages/content/specializations';
import { journeyReportRows, runPlayerJourney } from '../server/sim/playerJourney';
import type { PlayerJourneySummary } from '../server/sim/playerJourneyTypes';

const CLASS_NAMES = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];
const XP_SOURCES = ['quest', 'mob', 'boss'] as const;

describe('player journey simulator', () => {
  it('runs deterministic quest-and-grind routes for every base class', () => {
    for (const className of CLASS_NAMES) {
      const summary = runPlayerJourney({ className, horizonHours: 24 });

      expect(summary.className).toBe(className);
      expect(summary.windows).toHaveLength(24);
      expect(summary.endingLevel).toBeGreaterThan(1);
      expect(summary.questsCompleted).toBeGreaterThan(0);
      expect(summary.kills).toBeGreaterThan(0);
      expect(summary.gold).toBeGreaterThanOrEqual(0);
      expect(summary.time.combatMs).toBeGreaterThan(0);
      expect(summary.time.travelMs).toBeGreaterThan(0);
      expect(summary.deaths).toBe(0);
    }
  });

  it('chooses the requested specialization when the level-20 route reaches the specialization quest', () => {
    const summary = runPlayerJourney({
      className: 'mage',
      specializationId: 'arcanist',
      horizonHours: 168,
    });

    expect(summary.chosenSpecializationId).toBe('arcanist');
    expect(summary.questIdsCompleted).toContain('choose_your_path');
    for (const skillId of SPECIALIZATIONS.arcanist.specSkills ?? []) {
      expect(summary.beats.some((beat) => beat.kind === 'skill' && beat.label.includes(skillId))).toBe(true);
    }
  });

  it('tracks expected-value loot, vendor purchases, gear upgrades, and hourly empty windows', () => {
    const summary = runPlayerJourney({ className: 'warrior', horizonHours: 24 });

    expect(summary.totalExperienceEarned).toBeGreaterThan(0);
    expect(summary.xpBySource.quest).toBeGreaterThan(0);
    expect(summary.xpBySource.mob).toBeGreaterThan(0);
    expect(summary.xpBySource.boss).toBeGreaterThan(0);
    expect(summary.inventoryExpected.health_potion ?? 0).toBeGreaterThan(0);
    expect(summary.vendorPurchases.length).toBeGreaterThan(0);
    expect(summary.gearScore).toBeGreaterThan(0);
    expect(summary.beats.some((beat) => beat.kind === 'item_upgrade')).toBe(true);
    expect(summary.emptyWindowCount).toBe(summary.windows.filter((window) => window.isEmpty).length);
    expect(summary.maxMeaningfulGapHours).toBeGreaterThanOrEqual(0);
  });

  it('gets every specialization route to level 40 within one day without empty hourly windows', () => {
    for (const spec of Object.values(SPECIALIZATIONS)) {
      const summary = runPlayerJourney({
        className: spec.baseClass,
        specializationId: spec.id,
        horizonHours: 24,
      });

      expect(summary.endingLevel, spec.id).toBeGreaterThanOrEqual(40);
      expect(summary.chosenSpecializationId, spec.id).toBe(spec.id);
      expect(summary.questIdsCompleted, spec.id).toContain('frontier_orders');
      expect(summary.skippedLevelCount, spec.id).toBe(0);
      assertLevelProgressionReport(summary);
      for (const skillId of [...(spec.specSkills ?? []), ...(spec.proficiencySkills ?? [])]) {
        expect(summary.beats.some((beat) => beat.kind === 'skill' && beat.label.includes(skillId)), `${spec.id}:${skillId}`).toBe(true);
      }
      expect(summary.beats.some((beat) => beat.kind === 'proficiency' && beat.label.includes(spec.proficiencyPassive.name)), spec.id).toBe(true);
      expect(summary.emptyWindowCount, spec.id).toBe(0);
      expect(summary.maxMeaningfulGapHours, spec.id).toBeLessThanOrEqual(1.1);
    }
  });

  it('builds report rows for base classes and every specialization', () => {
    const rows = journeyReportRows();
    const specRows = rows.filter((row) => row.requestedSpecializationId);

    expect(rows.length).toBe(CLASS_NAMES.length + Object.keys(SPECIALIZATIONS).length);
    expect(specRows).toHaveLength(Object.keys(SPECIALIZATIONS).length);
    expect(new Set(rows.map((row) => row.className))).toEqual(new Set(CLASS_NAMES));
  });
});

function assertLevelProgressionReport(summary: PlayerJourneySummary): void {
  expect(summary.levelProgression).toHaveLength(summary.endingLevel);
  expect(summary.levelProgression[0]).toMatchObject({
    level: 1,
    source: 'start',
    totalXpEarned: 0,
    skippedBySingleAward: false,
  });

  for (let index = 1; index < summary.levelProgression.length; index += 1) {
    const previous = summary.levelProgression[index - 1]!;
    const report = summary.levelProgression[index]!;
    expect(report.level, summary.requestedSpecializationId).toBe(previous.level + 1);
    expect(report.reachedAtMs, `L${report.level}`).toBeGreaterThan(previous.reachedAtMs);
    expect(report.awardLevelIndex, `L${report.level}`).toBe(1);
    expect(report.skippedBySingleAward, `L${report.level}`).toBe(false);
    expect(XP_SOURCES).toContain(report.source);
    expect(report.totalXpEarned, `L${report.level}`).toBeGreaterThan(previous.totalXpEarned);
    expect(report.xpBySource.quest + report.xpBySource.mob + report.xpBySource.boss).toBe(report.totalXpEarned);
    assertLevelSourceDelta(report, previous);
  }
}

function assertLevelSourceDelta(
  report: PlayerJourneySummary['levelProgression'][number],
  previous: PlayerJourneySummary['levelProgression'][number],
): void {
  if (report.source === 'quest') {
    expect(report.questsCompleted, `L${report.level}`).toBeGreaterThan(previous.questsCompleted);
  } else if (report.source === 'mob') {
    expect(report.kills, `L${report.level}`).toBeGreaterThan(previous.kills);
  } else {
    expect(report.bossKills, `L${report.level}`).toBeGreaterThan(previous.bossKills);
  }
}
