/**
 * How loud a ground-loot pile is allowed to be, derived from the best item in
 * it — the drop's answer to "is that worth walking to?", read from where the
 * player is standing.
 *
 * The pile's box already carried the grade colour, but the ring, the sparks and
 * the name label were all hardcoded gold, so a junk drop and an S-grade drop
 * read the same from anywhere further than a hover. Everything a pile draws now
 * comes from one treatment, and the treatment is a pure function of the loot —
 * same shape as `enemyThreat`, and testable without a renderer.
 *
 * The louder half of the treatment (scale, beam, glow reach, label range) is
 * deliberately steep at the top and flat at the bottom: a farmed field of
 * grey-grade drops must stay quiet, and the one S-grade drop in it must be
 * impossible to walk past.
 */
import { ITEMS, getItemGrade } from '../../../packages/content/items';
import { getGradeSpec } from '../../../packages/content/equipmentTypes';

export type LootTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * Equipment-grade rank at which each tier starts, ordered loudest-first.
 * Ranks come from `GRADE_SPECS` (none 0, D 1, C 2, B 3, A 4, S 5), so the bands
 * move with the content rather than restating it: D and C share `uncommon`
 * because both are early-game filler you loot without stopping to look.
 */
const LOOT_BANDS: ReadonlyArray<{ minRank: number; tier: LootTier }> = [
  { minRank: 5, tier: 'legendary' },
  { minRank: 4, tier: 'epic' },
  { minRank: 3, tier: 'rare' },
  { minRank: 1, tier: 'uncommon' },
  { minRank: Number.NEGATIVE_INFINITY, tier: 'common' },
];

/** Rank of the best item in a stack; -1 when nothing in it is a known item. */
export function bestLootRank(items: readonly { itemId: string }[]): number {
  let best = -1;
  for (const entry of items) {
    const item = ITEMS[entry.itemId];
    if (!item) continue;
    best = Math.max(best, getGradeSpec(getItemGrade(item)).rank);
  }
  return best;
}

export function lootTierForRank(rank: number): LootTier {
  // An unknown id (content the client hasn't shipped yet) must not fire the
  // legendary beam — quiet is the safe guess for something we can't name.
  if (!Number.isFinite(rank)) return 'common';
  return LOOT_BANDS.find((band) => rank >= band.minRank)?.tier ?? 'common';
}

export type LootTreatment = {
  tier: LootTier;
  /** Grade colour — box, ring and glow all take it, so rarity reads as one hue. */
  color: string;
  /** Lifted toward white so the motes stay visible against the box they orbit. */
  sparkColor: string;
  labelColor: string;
  /** Whole-pile scale: junk shrinks out of the way, an S-grade drop looms. */
  scale: number;
  ringOpacity: number;
  sparkCount: number;
  glowIntensity: number;
  glowDistance: number;
  /** Pool priority — a legendary pile outbids a common one for a real light. */
  glowPriority: number;
  /** Vertical shaft, epic and up: the signal that carries over a hill. */
  beam: boolean;
  spinRate: number;
  bobAmplitude: number;
  /** Beam/ring breathing rate; 0 keeps a common pile perfectly still. */
  pulseRate: number;
  /** Metres within which the name shows unprompted, no hover needed. */
  labelRange: number;
};

type TierStyle = Omit<LootTreatment, 'tier' | 'color' | 'sparkColor' | 'labelColor'>;

const TIER_STYLES: Record<LootTier, TierStyle> = {
  legendary: {
    scale: 1.5, ringOpacity: 0.6, sparkCount: 6, glowIntensity: 3.4, glowDistance: 13,
    glowPriority: 6, beam: true, spinRate: 2.1, bobAmplitude: 0.14, pulseRate: 2.6, labelRange: 55,
  },
  epic: {
    scale: 1.28, ringOpacity: 0.55, sparkCount: 5, glowIntensity: 2.5, glowDistance: 10.5,
    glowPriority: 5, beam: true, spinRate: 1.7, bobAmplitude: 0.11, pulseRate: 1.9, labelRange: 38,
  },
  rare: {
    scale: 1.12, ringOpacity: 0.5, sparkCount: 4, glowIntensity: 1.9, glowDistance: 8.5,
    glowPriority: 4, beam: false, spinRate: 1.4, bobAmplitude: 0.09, pulseRate: 1.2, labelRange: 26,
  },
  uncommon: {
    scale: 0.96, ringOpacity: 0.42, sparkCount: 3, glowIntensity: 1.3, glowDistance: 6.5,
    glowPriority: 3, beam: false, spinRate: 1.1, bobAmplitude: 0.07, pulseRate: 0, labelRange: 15,
  },
  common: {
    // A farmed field is mostly this: no beam, no pulse, a dim short-range glow
    // and a label you have to walk up to. Quiet is the point.
    scale: 0.8, ringOpacity: 0.32, sparkCount: 2, glowIntensity: 0.8, glowDistance: 5,
    glowPriority: 2, beam: false, spinRate: 0.8, bobAmplitude: 0.05, pulseRate: 0, labelRange: 9,
  },
};

/** Mix a hex colour toward white; `amount` 0 keeps it, 1 makes it white. */
export function lighten(hex: string, amount: number): string {
  const parsed = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!parsed) return hex;
  const value = Number.parseInt(parsed[1], 16);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * Math.min(1, Math.max(0, amount)));
  const out = (mix((value >> 16) & 0xff) << 16) | (mix((value >> 8) & 0xff) << 8) | mix(value & 0xff);
  return `#${out.toString(16).padStart(6, '0')}`;
}

const UNKNOWN_LOOT_COLOR = getGradeSpec('none').color;

/** Everything one pile needs to draw itself, from the best item it holds. */
export function lootTreatment(items: readonly { itemId: string }[]): LootTreatment {
  const rank = bestLootRank(items);
  const tier = lootTierForRank(rank);
  const color = colorForRank(rank);
  return {
    tier,
    color,
    // Derived rather than listed per tier so a new grade colour in the content
    // carries through the whole marker without touching this file.
    sparkColor: lighten(color, 0.55),
    labelColor: lighten(color, 0.3),
    ...TIER_STYLES[tier],
  };
}

function colorForRank(rank: number): string {
  const spec = gradeSpecsByRank().get(rank);
  return spec?.color ?? UNKNOWN_LOOT_COLOR;
}

let byRank: Map<number, { color: string }> | undefined;
function gradeSpecsByRank(): Map<number, { color: string }> {
  if (!byRank) {
    byRank = new Map();
    for (const grade of ['none', 'd', 'c', 'b', 'a', 's'] as const) {
      const spec = getGradeSpec(grade);
      byRank.set(spec.rank, { color: spec.color });
    }
  }
  return byRank;
}
