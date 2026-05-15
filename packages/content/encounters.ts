export type EncounterMob = {
  type: string;
  weight: number;
  minCount: number;
  maxCount: number;
};

export type BiomeEncounterTableId =
  | 'emerald_grassland'
  | 'silverwood_forest'
  | 'sunspire_steppe'
  | 'moonfall_highland'
  | 'abyssal_wetland'
  | 'chronoglass_desert';

export const BIOME_ENCOUNTER_TABLES: Record<BiomeEncounterTableId, readonly EncounterMob[]> = {
  emerald_grassland: [
    { type: 'wolf', weight: 35, minCount: 3, maxCount: 5 },
    { type: 'meadow_sprite', weight: 35, minCount: 3, maxCount: 5 },
    { type: 'ancient_treant', weight: 30, minCount: 1, maxCount: 3 },
  ],
  silverwood_forest: [
    { type: 'spirit_guardian', weight: 35, minCount: 2, maxCount: 4 },
    { type: 'ethereal_sprite', weight: 40, minCount: 3, maxCount: 6 },
    { type: 'ancient_treant', weight: 25, minCount: 1, maxCount: 3 },
  ],
  sunspire_steppe: [
    { type: 'fire_elemental', weight: 40, minCount: 3, maxCount: 5 },
    { type: 'lava_golem', weight: 30, minCount: 2, maxCount: 4 },
    { type: 'drake', weight: 30, minCount: 1, maxCount: 2 },
  ],
  moonfall_highland: [
    { type: 'frost_wolf', weight: 40, minCount: 3, maxCount: 5 },
    { type: 'ice_giant', weight: 25, minCount: 1, maxCount: 3 },
    { type: 'star_weaver', weight: 35, minCount: 2, maxCount: 4 },
  ],
  abyssal_wetland: [
    { type: 'tentacle_horror', weight: 40, minCount: 2, maxCount: 4 },
    { type: 'void_spawner', weight: 35, minCount: 2, maxCount: 4 },
    { type: 'deep_leviathan', weight: 25, minCount: 1, maxCount: 2 },
  ],
  chronoglass_desert: [
    { type: 'time_wraith', weight: 35, minCount: 2, maxCount: 4 },
    { type: 'chrono_stalker', weight: 40, minCount: 2, maxCount: 5 },
    { type: 'temporal_overlord', weight: 25, minCount: 1, maxCount: 2 },
  ],
};

export function getBiomeEncounterMobs(tableId: BiomeEncounterTableId): EncounterMob[] {
  return BIOME_ENCOUNTER_TABLES[tableId].map((mob) => ({ ...mob }));
}
