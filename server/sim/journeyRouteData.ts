/** Vendor-facing value of the currency drops the journey sim tallies as gold. */
export const GOLD_VALUE_BY_CURRENCY: Record<string, number> = { gold_coin: 1, platinum_coin: 100 };

/**
 * The grind target a routed player would actually pull at each level band.
 * Highest `minLevel` wins, so the table reads top-down as the route ages.
 */
export const JOURNEY_ENEMY_BY_LEVEL: Array<{ minLevel: number; enemyType: string }> = [
  { minLevel: 40, enemyType: 'time_wraith' }, { minLevel: 35, enemyType: 'radiant_seraph' },
  { minLevel: 30, enemyType: 'rift_surveyor' }, { minLevel: 28, enemyType: 'frost_wolf' },
  { minLevel: 26, enemyType: 'brightglass_mote' }, { minLevel: 24, enemyType: 'road_thornback' },
  { minLevel: 22, enemyType: 'ash_dust_runner' }, { minLevel: 16, enemyType: 'fire_elemental' },
  { minLevel: 12, enemyType: 'shadowbeast' }, { minLevel: 9, enemyType: 'skeleton' },
  { minLevel: 7, enemyType: 'troll' }, { minLevel: 5, enemyType: 'wolf' }, { minLevel: 1, enemyType: 'goblin' },
];
