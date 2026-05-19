import { describe, expect, test } from 'vitest';
import { CLASS_AUTO_PASSIVE_SKILL } from '../packages/content/classPassives';
import {
  buildContributions,
  computeAllStats,
  type StatPlayerView,
} from '../packages/sim/statContributions';

// PR TT — movement now reads `player.stats.runSpeed`. These tests pin
// the Contribution pipeline so slow / speed_boost effects flow into
// the same stat the server consumes — no parallel multiplier branch.

function view(level: number, statusEffects: StatPlayerView['statusEffects'] = []): StatPlayerView {
  return {
    level,
    className: 'mage',
    race: 'human',
    unlockedSkills: [CLASS_AUTO_PASSIVE_SKILL.mage],
    statusEffects,
  };
}

function runSpeed(v: StatPlayerView): number {
  return computeAllStats(buildContributions(v), {
    level: v.level, className: v.className, race: v.race ?? 'human', health: 1, maxHealth: 1,
  }).totals.runSpeed;
}

describe('runSpeed is the single source for player movement', () => {
  test('baseline runSpeed at L1 matches the legacy DEFAULT_PLAYER_SPEED', () => {
    // Class passives may shift this; we only require the magnitude is
    // ~20 (units/sec) so the existing world feel survives the cutover.
    const v = runSpeed(view(1));
    expect(v).toBeGreaterThanOrEqual(15);
    expect(v).toBeLessThanOrEqual(28);
  });

  test('slow status effect reduces runSpeed proportionally to its value', () => {
    // Stats are rounded to whole units, so we compare ranges rather
    // than exact ratios.
    const base = runSpeed(view(1));
    const slowed = runSpeed(view(1, [
      { id: 's', type: 'slow', value: 40, startTimeTs: 0, durationMs: 1000, sourceSkill: 'frost_bolt' },
    ]));
    expect(slowed).toBeLessThan(base);
    expect(slowed / base).toBeGreaterThan(0.55);
    expect(slowed / base).toBeLessThan(0.65);
  });

  test('speed_boost status effect raises runSpeed proportionally to its value', () => {
    const base = runSpeed(view(1));
    const boosted = runSpeed(view(1, [
      { id: 'b', type: 'speed_boost', value: 30, startTimeTs: 0, durationMs: 1000, sourceSkill: 'haste' },
    ]));
    expect(boosted).toBeGreaterThan(base);
    expect(boosted / base).toBeGreaterThan(1.20);
    expect(boosted / base).toBeLessThan(1.35);
  });
});
