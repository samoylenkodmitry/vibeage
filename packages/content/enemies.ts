import type { SkillId } from './skills.js';

type EnemyFamily =
  | 'beast'
  | 'humanoid'
  | 'undead'
  | 'elemental'
  | 'dragon'
  | 'aberration'
  | 'fey'
  | 'spirit'
  | 'plant'
  | 'construct';

export type EnemyVisualSpec = {
  color: string;
  height: number;
  shape: 'box' | 'sphere';
  glow: boolean;
};

type EnemyStatMultipliers = {
  health: number;
  damage: number;
  attackRange: number;
  aggroRadius: number;
  movementSpeed: number;
  experience: number;
  attackCooldownMs: number;
  /**
   * §46/slice-3 — multiplier on the per-pack aggro / disengage
   * radius (default 1, baseline 60m). Tighten for cautious species
   * (Frost Wolves cluster tightly), loosen for opportunistic packs.
   * Multiplied against `DEFAULT_PACK_AGGRO_RADIUS_M` in createEnemy.
   */
  packAggroRadius: number;
};

/**
 * Per-species combat characteristics, authored in content (not a
 * combat-code default). The damage/dodge systems read these off the
 * mob's derived `stats` block exactly as they read a player's. Omit
 * any field to take the content-level default below — that default
 * lives here in the spec layer, never as a `?? <n>` in the engine.
 */
export type EnemyCombatSpec = {
  /** Hit rating, opposed by the target's Evasion. */
  accuracy: number;
  /** Dodge rating, opposed by the attacker's Accuracy. */
  evasion: number;
  /** Physical / magical mitigation (mitigatedDamage curve). */
  pDef: number;
  mDef: number;
  /** HP restored per second (0 = doesn't regenerate). */
  hpRegen: number;
};

const DEFAULT_ENEMY_COMBAT: EnemyCombatSpec = {
  accuracy: 90, // matches the old ACCURACY_BASELINE the damage path used to assume
  evasion: 0,
  pDef: 0,
  mDef: 0,
  hpRegen: 0,
};

/**
 * The shared mob power curve: how a level-N mob's raw combat values
 * scale before its per-species `stats` multipliers apply. These are the
 * baseline the engine combines with each mob's spec — `createEnemy` owns
 * no magic numbers, it just evaluates `(flat + level*perLevel) * mult`.
 * Tuning the global mob progression happens here in the spec layer, not
 * in engine code.
 */
export const ENEMY_BASE_SCALING = {
  /** Max HP = (flat + level*perLevel) × stats.health. */
  health: { flat: 100, perLevel: 20 },
  /** XP award = (flat + level*perLevel) × stats.experience. */
  experience: { flat: 50, perLevel: 10 },
  /** Attack damage = (flat + level*perLevel) × stats.damage. */
  damage: { flat: 10, perLevel: 2 },
  /** Flat baselines (level-independent) × the matching stats multiplier. */
  movementSpeed: 12, // doubled in PR #324 when the AI double-step was removed
  attackRange: 2,
  aggroRadius: 15,
  attackCooldownMs: 2000,
} as const;

export type EnemyTemplate = {
  type: string;
  displayName: string;
  family: EnemyFamily;
  visual: EnemyVisualSpec;
  stats: EnemyStatMultipliers;
  /** Per-species combat characteristics; missing fields take DEFAULT_ENEMY_COMBAT. */
  combat?: Partial<EnemyCombatSpec>;
  /**
   * The mob's abilities, by skill id from the shared SKILLS registry,
   * in priority order (the engine casts the first usable one). Every mob
   * has at least the universal `mobStrike`; some carry a signature.
   * This is the single source of truth the engine casts and the wiki
   * renders.
   */
  skills: SkillId[];
  lootTableId?: string;
};

/** The fully-resolved combat characteristics for a template (spec + defaults). */
export function resolveEnemyCombat(template: EnemyTemplate): EnemyCombatSpec {
  return { ...DEFAULT_ENEMY_COMBAT, ...template.combat };
}

const DEFAULT_ENEMY_STATS: EnemyStatMultipliers = {
  health: 1,
  damage: 1,
  attackRange: 1,
  aggroRadius: 1,
  movementSpeed: 1,
  experience: 1,
  attackCooldownMs: 1,
  packAggroRadius: 1,
};

/**
 * §46/slice-3 — baseline pack aggro/disengage radius in metres.
 * Multiplied by per-species `packAggroRadius` to land on the
 * effective range. Was a server-local constant; pulled into content
 * so future content edits (and tests) don't need a server import.
 */
export const DEFAULT_PACK_AGGRO_RADIUS_M = 60;

const TEMPLATES: EnemyTemplate[] = [
  // Starter meadow
  template('goblin', 'Goblin', 'humanoid', { color: '#8fbf6a', height: 1.0, shape: 'box', glow: false }, { damage: 0.9, movementSpeed: 1.05 }),
  template('wolf', 'Gray Wolf', 'beast', { color: '#b08968', height: 0.9, shape: 'box', glow: false }, { health: 0.85, damage: 1.05, movementSpeed: 1.25 }),
  template('skeleton', 'Skeleton', 'undead', { color: '#d7d3c7', height: 1.1, shape: 'box', glow: false }, { health: 1.1 }),
  template('slime', 'Forest Slime', 'aberration', { color: '#56d88b', height: 0.85, shape: 'sphere', glow: false }, { health: 1.3, damage: 0.6, movementSpeed: 0.6, attackRange: 0.9 }, ['mobPoisonBite', 'mobStrike']),
  template('meadow_sprite', 'Meadow Sprite', 'fey', { color: '#f9d66a', height: 0.9, shape: 'sphere', glow: true }, { health: 0.7, damage: 0.8, movementSpeed: 1.2 }),

  // Dark forest / misty / rocky
  template('troll', 'Cave Troll', 'humanoid', { color: '#5b6b4a', height: 1.6, shape: 'box', glow: false }, { health: 1.8, damage: 1.4, movementSpeed: 0.85, attackRange: 1.2 }),
  template('orc', 'Orc Raider', 'humanoid', { color: '#6f8a3a', height: 1.3, shape: 'box', glow: false }, { health: 1.3, damage: 1.2 }, ['mobWarbandHowl', 'mobStrike']),

  // Cursed ruins
  template('wraith', 'Wraith', 'spirit', { color: '#a8b3d6', height: 1.3, shape: 'sphere', glow: true }, { health: 0.9, damage: 1.3, movementSpeed: 1.1, aggroRadius: 1.2 }),
  template('necromancer', 'Necromancer', 'humanoid', { color: '#5b3a8a', height: 1.2, shape: 'box', glow: true }, { health: 1.0, damage: 1.5, attackRange: 1.6, attackCooldownMs: 1.2 }),

  // Dragon peaks
  template('wyvern', 'Wyvern', 'dragon', { color: '#7a5b3a', height: 1.5, shape: 'box', glow: false }, { health: 1.5, damage: 1.4, movementSpeed: 1.15 }),
  template('drake', 'Drake', 'dragon', { color: '#bf5a3a', height: 1.6, shape: 'box', glow: true }, { health: 1.7, damage: 1.5, attackRange: 1.3 }, ['mobFirebolt', 'mobStrike']),
  template('dragon', 'Wyrm', 'dragon', { color: '#8b1a1a', height: 2.0, shape: 'box', glow: true }, { health: 2.5, damage: 2.0, attackRange: 1.6, aggroRadius: 1.4 }, ['mobBreath', 'mobStrike']),

  // Shadow valley
  template('shadowbeast', 'Shadowbeast', 'aberration', { color: '#1f1f3a', height: 1.2, shape: 'box', glow: true }, { health: 1.2, damage: 1.4, movementSpeed: 1.15 }),
  template('darkstalker', 'Darkstalker', 'aberration', { color: '#2d1f3a', height: 1.3, shape: 'box', glow: true }, { health: 1.1, damage: 1.5, movementSpeed: 1.3, aggroRadius: 1.3 }),
  template('voidwalker', 'Voidwalker', 'aberration', { color: '#3a1f5b', height: 1.5, shape: 'box', glow: true }, { health: 1.6, damage: 1.6, attackRange: 1.4 }),

  // Crystal caverns
  template('crystal_golem', 'Crystal Golem', 'construct', { color: '#7dd3fc', height: 1.5, shape: 'box', glow: true }, { health: 2.0, damage: 1.3, movementSpeed: 0.8 }),
  template('crystal_elemental', 'Crystal Elemental', 'elemental', { color: '#a5f3fc', height: 1.3, shape: 'sphere', glow: true }, { health: 1.2, damage: 1.4, attackRange: 1.4 }),
  template('crystal_guardian', 'Crystal Guardian', 'construct', { color: '#67e8f9', height: 1.7, shape: 'box', glow: true }, { health: 2.2, damage: 1.6, attackRange: 1.3 }),

  // Sunspire steppe / fire
  template('fire_elemental', 'Fire Elemental', 'elemental', { color: '#fb923c', height: 1.2, shape: 'sphere', glow: true }, { damage: 1.4, movementSpeed: 1.1 }, ['mobFirebolt', 'mobStrike']),
  template('lava_golem', 'Lava Golem', 'construct', { color: '#dc2626', height: 1.6, shape: 'box', glow: true }, { health: 2.0, damage: 1.5, movementSpeed: 0.85 }, ['mobFirebolt', 'mobStrike']),
  template('flame_wraith', 'Flame Wraith', 'spirit', { color: '#f97316', height: 1.3, shape: 'sphere', glow: true }, { damage: 1.5, movementSpeed: 1.2, aggroRadius: 1.2 }, ['mobFirebolt', 'mobStrike']),

  // Moonfall highland / ice
  template('frost_wolf', 'Frost Wolf', 'beast', { color: '#bae6fd', height: 0.95, shape: 'box', glow: false }, { health: 1.0, damage: 1.2, movementSpeed: 1.3 }, ['mobFrostbolt', 'mobStrike']),
  template('ice_giant', 'Ice Giant', 'humanoid', { color: '#cffafe', height: 1.9, shape: 'box', glow: true }, { health: 2.2, damage: 1.7, movementSpeed: 0.85 }, ['mobFrostbolt', 'mobStrike']),
  template('ice_elemental', 'Ice Elemental', 'elemental', { color: '#bfdbfe', height: 1.3, shape: 'sphere', glow: true }, { health: 1.2, damage: 1.4, attackRange: 1.4 }, ['mobFrostbolt', 'mobStrike']),
  template('star_weaver', 'Star Weaver', 'fey', { color: '#e9d5ff', height: 1.2, shape: 'sphere', glow: true }, { damage: 1.3, attackRange: 1.6, attackCooldownMs: 1.1 }),

  // Silverwood forest / fey
  template('spirit_guardian', 'Spirit Guardian', 'spirit', { color: '#bbf7d0', height: 1.4, shape: 'sphere', glow: true }, { health: 1.3, damage: 1.2, attackRange: 1.4 }),
  template('ethereal_sprite', 'Ethereal Sprite', 'fey', { color: '#ddd6fe', height: 0.95, shape: 'sphere', glow: true }, { health: 0.7, damage: 0.9, movementSpeed: 1.25 }),
  template('ancient_treant', 'Ancient Treant', 'plant', { color: '#65a30d', height: 1.9, shape: 'box', glow: false }, { health: 2.4, damage: 1.5, movementSpeed: 0.7, attackRange: 1.4 }),

  // Abyssal wetland
  template('tentacle_horror', 'Tentacle Horror', 'aberration', { color: '#4c1d95', height: 1.4, shape: 'sphere', glow: true }, { health: 1.4, damage: 1.4, attackRange: 1.5 }, ['mobPoisonBite', 'mobStrike']),
  template('void_spawner', 'Void Spawner', 'aberration', { color: '#312e81', height: 1.2, shape: 'sphere', glow: true }, { health: 1.1, damage: 1.3 }),
  template('deep_leviathan', 'Deep Leviathan', 'aberration', { color: '#1e1b4b', height: 2.1, shape: 'box', glow: true }, { health: 2.6, damage: 1.8, attackRange: 1.8, movementSpeed: 0.9 }),

  // Chronoglass desert
  template('time_wraith', 'Time Wraith', 'spirit', { color: '#fde68a', height: 1.3, shape: 'sphere', glow: true }, { health: 1.0, damage: 1.5, movementSpeed: 1.2 }),
  template('chrono_stalker', 'Chrono Stalker', 'aberration', { color: '#facc15', height: 1.3, shape: 'box', glow: true }, { health: 1.2, damage: 1.4, movementSpeed: 1.3, aggroRadius: 1.3 }),
  template('temporal_overlord', 'Temporal Overlord', 'aberration', { color: '#eab308', height: 2.0, shape: 'box', glow: true }, { health: 2.4, damage: 2.0, attackRange: 1.5 }),

  // High progression route mobs
  template('cinder_sentinel', 'Cinder Sentinel', 'construct', { color: '#f97316', height: 1.55, shape: 'box', glow: true }, { health: 1.8, damage: 1.45, movementSpeed: 0.9 }, ['mobFirebolt', 'mobStrike']),
  template('sunscale_drake', 'Sunscale Drake', 'dragon', { color: '#fbbf24', height: 1.45, shape: 'box', glow: true }, { health: 1.5, damage: 1.55, movementSpeed: 1.15, attackRange: 1.25 }, ['mobFirebolt', 'mobStrike']),
  template('starglass_weaver', 'Starglass Weaver', 'fey', { color: '#c4b5fd', height: 1.2, shape: 'sphere', glow: true }, { health: 1.15, damage: 1.45, attackRange: 1.65, movementSpeed: 1.12 }, ['mobFrostbolt', 'mobStrike']),
  template('lumen_warden', 'Lumen Warden', 'construct', { color: '#fef3c7', height: 1.75, shape: 'box', glow: true }, { health: 2.0, damage: 1.55, attackRange: 1.35, movementSpeed: 0.9 }),
  template('bog_reaver', 'Bog Reaver', 'humanoid', { color: '#14532d', height: 1.35, shape: 'box', glow: false }, { health: 1.55, damage: 1.45, movementSpeed: 1.0, packAggroRadius: 1.15 }, ['mobPoisonBite', 'mobStrike']),
  template('lantern_wraith', 'Lantern Wraith', 'spirit', { color: '#22d3ee', height: 1.3, shape: 'sphere', glow: true }, { health: 1.1, damage: 1.6, movementSpeed: 1.22, aggroRadius: 1.25 }, ['mobPoisonBite', 'mobStrike']),
  template('glass_harrier', 'Glass Harrier', 'aberration', { color: '#fde68a', height: 1.15, shape: 'sphere', glow: true }, { health: 1.05, damage: 1.5, movementSpeed: 1.45, aggroRadius: 1.2 }),
  template('rift_mender', 'Rift Mender', 'construct', { color: '#facc15', height: 1.45, shape: 'box', glow: true }, { health: 1.75, damage: 1.5, attackRange: 1.45, movementSpeed: 0.95 }, ['mobFrostbolt', 'mobStrike']),

  // Bonus tier
  template('radiant_seraph', 'Radiant Seraph', 'spirit', { color: '#fef08a', height: 1.7, shape: 'sphere', glow: true }, { health: 1.8, damage: 1.7, attackRange: 1.5 }),
  template('celestial_guardian', 'Celestial Guardian', 'construct', { color: '#fef9c3', height: 2.0, shape: 'box', glow: true }, { health: 2.5, damage: 1.9, attackRange: 1.5 }),
  template('spider', 'Giant Spider', 'beast', { color: '#1f2937', height: 0.9, shape: 'box', glow: false }, { health: 0.95, damage: 1.1, movementSpeed: 1.3 }, ['mobPoisonBite', 'mobStrike']),
];

export const ENEMY_TEMPLATES: Record<string, EnemyTemplate> = Object.fromEntries(
  TEMPLATES.map((spec) => [spec.type, spec]),
);

const DEFAULT_ENEMY_TEMPLATE: EnemyTemplate = {
  type: '__default__',
  displayName: 'Unknown',
  family: 'aberration',
  visual: { color: '#ef6461', height: 1.1, shape: 'box', glow: false },
  stats: DEFAULT_ENEMY_STATS,
  skills: ['mobStrike'],
};

export function getEnemyTemplate(type: string): EnemyTemplate {
  return ENEMY_TEMPLATES[type] ?? DEFAULT_ENEMY_TEMPLATE;
}

function template(
  type: string,
  displayName: string,
  family: EnemyFamily,
  visual: EnemyVisualSpec,
  statOverrides: Partial<EnemyStatMultipliers> = {},
  skills: SkillId[] = ['mobStrike'],
): EnemyTemplate {
  return {
    type,
    displayName,
    family,
    visual,
    stats: { ...DEFAULT_ENEMY_STATS, ...statOverrides },
    skills,
  };
}
