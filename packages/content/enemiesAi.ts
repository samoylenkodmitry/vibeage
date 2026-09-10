import type { SkillId } from './skills.js';
import { getEnemyTemplate, type EnemyFamily, type EnemyTemplate } from './enemies.js';

/**
 * Encounter variety — the AI *policy* layer.
 *
 * Mob offense is already one shared pipeline (docs/UNIFIED_OFFENSE.md);
 * what made every fight feel the same was the single hardcoded
 * behaviour: walk to melee, stand still, swing. This file is the
 * content-side answer — a small set of behaviour archetypes, each a
 * plain data record the state machine evaluates. A caster kites, a
 * brute charges and winds up, a skirmisher darts to a flank, a pack
 * circles until it has numbers, a support hangs back and mends its
 * allies. No `if (type === 'wolf')` anywhere in the engine: a species
 * gets its behaviour by naming an archetype (or, failing that, by its
 * family), and every tuning number lives here where the wiki reads it.
 */
export type EnemyAiArchetypeId =
  | 'brawler'
  | 'caster'
  | 'skirmisher'
  | 'brute'
  | 'packHunter'
  | 'support';

export type EnemyAiPolicy = {
  readonly id: EnemyAiArchetypeId;
  readonly name: string;
  /** Player-facing summary; the wiki renders this next to the mob. */
  readonly description: string;
  /**
   * How far out the mob fights, as a fraction of the longest range
   * among the abilities it currently has off cooldown. 1 = hold at the
   * edge of its reach, 0 = always close to melee. Melee-only mobs are
   * unaffected — their longest reach IS melee.
   */
  readonly holdRangeFraction: number;
  /**
   * Back away while the target is inside this many metres AND the mob
   * still has a ranged ability ready. 0 = never give ground. Gating on
   * "has a ranged option ready" is what stops a melee-only starter mob
   * from ever running from a new player.
   */
  readonly backpedalWithinM: number;
  /** Speed multiplier while backpedalling / strafing / charging. */
  readonly repositionSpeedMul: number;
  /** Dart to a flank after this many casts (0 = never reposition). */
  readonly strafeAfterCasts: number;
  readonly strafeMs: number;
  /** Sprint this much faster for `chargeMs` after first sighting a target. */
  readonly chargeSpeedMul: number;
  readonly chargeMs: number;
  /**
   * Circle the target instead of committing until this many packmates
   * are engaged on it. Ignored when the mob is alone (a lone wolf still
   * attacks) and capped by RALLY_PATIENCE_MS so a fight never stalls.
   */
  readonly rallyAllies: number;
  /**
   * Below this HP fraction, break off once, fall back toward spawn and
   * pull nearby packmates onto the target. 0 = fight to the death.
   */
  readonly regroupHpFraction: number;
  /**
   * Abilities every mob of this archetype gains, ahead of its template
   * skills in priority order. This is how an archetype gets a signature
   * (a brute's telegraphed cleave, a support's mend) without editing
   * fifty template rows.
   */
  readonly grantSkills: readonly SkillId[];
};

const BRAWLER_DEFAULTS = {
  holdRangeFraction: 0,
  backpedalWithinM: 0,
  repositionSpeedMul: 1,
  strafeAfterCasts: 0,
  strafeMs: 0,
  chargeSpeedMul: 1,
  chargeMs: 0,
  rallyAllies: 0,
  regroupHpFraction: 0,
  grantSkills: [] as readonly SkillId[],
} as const;

export const ENEMY_AI_POLICIES: Record<EnemyAiArchetypeId, EnemyAiPolicy> = {
  brawler: {
    ...BRAWLER_DEFAULTS,
    id: 'brawler',
    name: 'Brawler',
    description: 'Closes to melee and trades hits. No tricks — the honest fight a new player learns on.',
  },
  caster: {
    ...BRAWLER_DEFAULTS,
    id: 'caster',
    name: 'Caster',
    description: 'Fights at the edge of its spell range and gives ground when closed on — until its spell is on cooldown, when it comes in swinging.',
    holdRangeFraction: 0.85,
    backpedalWithinM: 7,
    repositionSpeedMul: 0.95,
  },
  skirmisher: {
    ...BRAWLER_DEFAULTS,
    id: 'skirmisher',
    name: 'Skirmisher',
    description: 'Strikes and slides to a flank, never standing where you last swung. Opens by blinking behind its mark.',
    repositionSpeedMul: 1.4,
    strafeAfterCasts: 2,
    strafeMs: 900,
    grantSkills: ['mobFlankStrike'],
  },
  brute: {
    ...BRAWLER_DEFAULTS,
    id: 'brute',
    name: 'Brute',
    description: 'Charges the moment it sees you, then winds up a telegraphed cleave you can step out of.',
    repositionSpeedMul: 1,
    chargeSpeedMul: 1.7,
    chargeMs: 1_800,
    grantSkills: ['mobCleave'],
  },
  packHunter: {
    ...BRAWLER_DEFAULTS,
    id: 'packHunter',
    name: 'Pack hunter',
    description: 'Circles at the edge of the fight until a packmate is on you too, then both pile in.',
    repositionSpeedMul: 1.25,
    strafeAfterCasts: 3,
    strafeMs: 700,
    rallyAllies: 1,
  },
  support: {
    ...BRAWLER_DEFAULTS,
    id: 'support',
    name: 'Support',
    description: 'Keeps its distance, mends whatever ally is worst hurt, and falls back screaming for help when its own health breaks.',
    holdRangeFraction: 0.9,
    backpedalWithinM: 9,
    repositionSpeedMul: 1.1,
    regroupHpFraction: 0.35,
    grantSkills: ['mobMendPack'],
  },
};

/**
 * How a species behaves when it doesn't name an archetype. Family is
 * already the "what kind of thing is this" axis, and it reads right:
 * elementals and fey throw spells, dragons and constructs bull through,
 * beasts hunt in packs.
 */
const AI_BY_FAMILY: Record<EnemyFamily, EnemyAiArchetypeId> = {
  beast: 'packHunter',
  humanoid: 'brawler',
  undead: 'brawler',
  elemental: 'caster',
  dragon: 'brute',
  aberration: 'skirmisher',
  fey: 'caster',
  spirit: 'caster',
  plant: 'brawler',
  construct: 'brute',
};

/**
 * Per-species overrides where the family default reads wrong — a slime
 * is an aberration but nothing about it darts, a necromancer is a
 * humanoid who very much hangs back. Everything not listed takes its
 * family's archetype above.
 */
const AI_BY_TYPE: Record<string, EnemyAiArchetypeId> = {
  // Starter meadow: the first fights stay honest, straight trades.
  goblin: 'brawler',
  slime: 'brawler',
  meadow_sprite: 'brawler',
  spider: 'skirmisher',

  // Dark forest / ruins.
  troll: 'brute',
  orc: 'packHunter',
  necromancer: 'support',

  // Shadow valley / abyss — the heavies bull in, the stalkers flank.
  voidwalker: 'brute',
  deep_leviathan: 'brute',
  void_spawner: 'support',
  temporal_overlord: 'brute',
  bog_reaver: 'packHunter',

  // Casters wearing humanoid/construct skins.
  coldstar_acolyte: 'caster',
  rift_mender: 'support',
  radiant_seraph: 'support',

  // Slow siege pieces.
  ice_giant: 'brute',
  ancient_treant: 'brute',
  road_thornback: 'brawler',
};

export function enemyAiArchetypeFor(template: EnemyTemplate): EnemyAiArchetypeId {
  return AI_BY_TYPE[template.type] ?? AI_BY_FAMILY[template.family];
}

export function enemyAiPolicyForType(type: string): EnemyAiPolicy {
  return ENEMY_AI_POLICIES[enemyAiArchetypeFor(getEnemyTemplate(type))];
}

/**
 * The mob's full ability list: archetype grants first (so a brute
 * actually reaches for its cleave), then the template's own skills,
 * de-duplicated and order-preserving.
 */
export function enemySkillsWithArchetype(template: EnemyTemplate): SkillId[] {
  const policy = ENEMY_AI_POLICIES[enemyAiArchetypeFor(template)];
  const seen = new Set<SkillId>();
  const out: SkillId[] = [];
  for (const id of [...policy.grantSkills, ...template.skills]) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Shared behavioural constants the state machine reads. They live here
 * rather than in engine code so a designer can retune "how patient is a
 * pack" without touching the AI.
 */
export const ENEMY_AI_TUNING = {
  /** Radius the rally check sweeps for packmates. */
  rallyScanRadiusM: 25,
  /** A pack commits after this long regardless of how few showed up. */
  rallyPatienceMs: 3_000,
  /** Distance a rallying mob circles its target at. */
  rallyHoldRangeM: 7,
  /** Hysteresis on the fight/chase boundary so mobs don't flicker states. */
  holdRangeSlackMul: 1.2,
  /** How long a regrouping mob refuses to re-engage. */
  regroupDisengageMs: 6_000,
} as const;
