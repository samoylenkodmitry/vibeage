import { getBiomeEncounterMobs } from './encounters.js';
import { randomAnnulusDistance } from '../sim/geometry.js';
import {
  dayPhaseLabel,
  isMobAllowedInPhase,
  type DayPhaseLabel,
} from '../sim/timeOfDay.js';
import { getTerrainHeight } from './terrain.js';

// Types for zone management
export interface ZoneMob {
    type: string;
    weight: number;
    minCount: number;
    maxCount: number;
    packSize?: number;
    activePhases?: readonly DayPhaseLabel[];
    /**
     * PR FF — optional explicit spawn anchor in world coords. When
     * present, the server seeds this mob's group around this point
     * (jittered inside `spawnRadius`) instead of picking a random
     * in-zone point, and the Wiki "Mobs" tab points the map pin at
     * the actual camp rather than the zone centroid. Same spec drives
     * the engine and the wiki — single source of truth.
     */
    position?: { x: number; y: number; z: number };
    /** Jitter radius around `position` (default 8m). */
    spawnRadius?: number;
}

export interface ZoneMiniBoss {
    /**
     * Stable id linking this spawn to the content registry in
     * packages/content/miniBosses.ts (MINI_BOSSES[id]). The Wiki
     * "Bosses" tab + spawn pipeline both read from that registry so
     * lore / signature ability / drops stay in one place.
     */
    id?: string;
    type: string;
    name: string;
    levelBonus?: number;
    healthMultiplier?: number;
    damageMultiplier?: number;
    lootTableId?: string;
    activePhases?: readonly DayPhaseLabel[];
    /**
     * PR V — explicit world-space spawn for this mini-boss. When
     * present, the server uses this instead of a random in-zone
     * point and the Wiki / Mobs tab points the map pin at the
     * actual encounter rather than the zone centroid (which is
     * meaningless for huge zones like Chronoglass).
     */
    position?: { x: number; y: number; z: number };
}

export interface Zone {
    id: string;
    name: string;
    description: string;
    position: { x: number; y: number; z: number };
    radius: number;
    spawnExclusionRadius?: number;
    minLevel: number;
    maxLevel: number;
    mobs: ZoneMob[];
    miniBoss?: ZoneMiniBoss;
}

export interface MobSpawnConfig {
    type: string;
    count: number;
    packSize?: number;
    /** PR FF — passthrough from ZoneMob so the spawner can anchor here. */
    position?: { x: number; y: number; z: number };
    spawnRadius?: number;
}

export type ZoneManagerOptions = {
    zones?: readonly Zone[];
    zoneById?: ReadonlyMap<string, Zone>;
};

export class ZoneManager {
    private readonly zones: readonly Zone[];
    private readonly zoneById: ReadonlyMap<string, Zone>;

    constructor(options: ZoneManagerOptions = {}) {
        this.zones = options.zones ?? GAME_ZONES;
        this.zoneById = options.zoneById ?? createZoneLookup(this.zones);
    }

    getZoneById(zoneId: string): Zone | null {
        return this.zoneById.get(zoneId) ?? null;
    }

    getZoneAtPosition(position: { x: number; z: number; y?: number }): Zone | null {
        for (const zone of this.zones) {
            const dx = position.x - zone.position.x;
            const dz = position.z - zone.position.z;
            const distanceSquared = dx * dx + dz * dz;

            if (distanceSquared <= zone.radius * zone.radius) {
                return zone;
            }
        }
        return null;
    }

    getMobsToSpawn(zoneId: string, nowMs: number = Date.now(), rng: () => number = Math.random): MobSpawnConfig[] {
        const zone = this.getZoneById(zoneId);
        if (!zone) return [];
        const phase = dayPhaseLabel(nowMs);

        return zone.mobs
            .filter((mobConfig) => isMobAllowedInPhase(mobConfig.activePhases, phase))
            .map(mobConfig => {
                const count = Math.floor(
                    rng() * (mobConfig.maxCount - mobConfig.minCount + 1) +
                    mobConfig.minCount
                );
                return {
                    type: mobConfig.type,
                    count,
                    packSize: mobConfig.packSize,
                    position: mobConfig.position,
                    spawnRadius: mobConfig.spawnRadius,
                };
            });
    }

    getMiniBoss(zoneId: string, nowMs: number = Date.now()): ZoneMiniBoss | null {
        const miniBoss = this.getZoneById(zoneId)?.miniBoss;
        if (!miniBoss) return null;
        if (!isMobAllowedInPhase(miniBoss.activePhases, dayPhaseLabel(nowMs))) {
            return null;
        }
        return miniBoss;
    }

    getRandomPositionInZone(zoneId: string, rng: () => number = Math.random): { x: number; y: number; z: number } | null {
        const zone = this.getZoneById(zoneId);
        if (!zone) return null;

        const angle = rng() * Math.PI * 2;
        const minDistance = zone.spawnExclusionRadius ?? 0;
        const distance = randomAnnulusDistance(minDistance, zone.radius, rng());

        const x = zone.position.x + Math.cos(angle) * distance;
        const z = zone.position.z + Math.sin(angle) * distance;

        return {
            x,
            y: getTerrainHeight(x, z) + 0.5,
            z
        };
    }

    getMobLevel(zoneId: string, rng: () => number = Math.random): number {
        const zone = this.getZoneById(zoneId);
        if (!zone) return 1;

        return Math.floor(
            rng() * (zone.maxLevel - zone.minLevel + 1) +
            zone.minLevel
        );
    }

    /**
     * Get all available game zones
     * @returns Array of all zones
     */
    getZones(): Zone[] {
        return [...this.zones];
    }
}

export function createZoneLookup(zones: readonly Zone[] = GAME_ZONES): ReadonlyMap<string, Zone> {
    return new Map(zones.map(zone => [zone.id, zone]));
}

export const GAME_ZONES: Zone[] = [
    {
        id: 'starter_meadow',
        name: 'Peaceful Meadows',
        description: 'A tranquil starting area with gentle slopes and scattered trees',
        position: { x: 0, y: 0, z: 0 },
        radius: 100,
        spawnExclusionRadius: 35,
        minLevel: 1,
        maxLevel: 3,
        // PR FF — anchor every starter-mob group to a named camp so
        // the wiki "Spawns in" pin sends a fresh player to the actual
        // encounter (a 100m-radius zone is too vague to be useful).
        mobs: [
            { type: 'goblin', weight: 60, minCount: 5, maxCount: 8, position: { x: 50, y: 0.5, z: 55 }, spawnRadius: 10 },
            { type: 'wolf', weight: 25, minCount: 2, maxCount: 4, packSize: 3, position: { x: -55, y: 0.5, z: 60 }, spawnRadius: 10 },
            { type: 'skeleton', weight: 15, minCount: 1, maxCount: 2, activePhases: ['dusk', 'night'], position: { x: 40, y: 0.5, z: -70 }, spawnRadius: 8 },
            { type: 'slime', weight: 10, minCount: 1, maxCount: 2, position: { x: -50, y: 0.5, z: -45 }, spawnRadius: 8 },
            { type: 'meadow_sprite', weight: 5, minCount: 1, maxCount: 1, activePhases: ['dawn', 'day'], position: { x: 70, y: 0.5, z: 5 }, spawnRadius: 6 }
        ],
        miniBoss: { id: 'grakk', type: 'goblin', name: 'Grakk the Goblin Chief', levelBonus: 2, healthMultiplier: 3, damageMultiplier: 1.5, lootTableId: 'boss_loot_grakk', position: { x: 35, y: 0.5, z: 35 } }
    },
    {
        id: 'dark_forest',
        name: 'Dark Forest',
        description: 'A dense forest with challenging enemies',
        position: { x: 200, y: 0, z: 200 },
        radius: 150,
        minLevel: 3,
        maxLevel: 5,
        mobs: [
            { type: 'wolf', weight: 40, minCount: 4, maxCount: 8, packSize: 4, position: { x: 170, y: 0.5, z: 230 }, spawnRadius: 20 },
            { type: 'skeleton', weight: 60, minCount: 3, maxCount: 6, position: { x: 240, y: 0.5, z: 170 }, spawnRadius: 20 },
            { type: 'spider', weight: 30, minCount: 3, maxCount: 6, packSize: 2, position: { x: 220, y: 0.5, z: 250 }, spawnRadius: 18 }
        ],
        miniBoss: { id: 'old_greyfang', type: 'wolf', name: 'Old Greyfang', levelBonus: 2, healthMultiplier: 3, damageMultiplier: 1.6, lootTableId: 'boss_loot_old_greyfang', position: { x: 230, y: 0.5, z: 230 } }
    },
    {
        id: 'rocky_highlands',
        name: 'Rocky Highlands',
        description: 'Elevated rocky terrain with strong enemies',
        position: { x: -200, y: 0, z: -200 },
        radius: 120,
        minLevel: 4,
        maxLevel: 7,
        mobs: [
            { type: 'troll', weight: 40, minCount: 3, maxCount: 6, position: { x: -160, y: 0.5, z: -240 }, spawnRadius: 15 },
            { type: 'orc', weight: 60, minCount: 5, maxCount: 8, packSize: 3, position: { x: -240, y: 0.5, z: -160 }, spawnRadius: 18 }
        ],
        miniBoss: { id: 'hammerback', type: 'troll', name: 'Hammerback the Hill Troll', levelBonus: 2, healthMultiplier: 3.2, damageMultiplier: 1.6, lootTableId: 'boss_loot_hammerback', position: { x: -170, y: 0.5, z: -170 } }
    },
    {
        id: 'misty_lake',
        name: 'Misty Lake',
        description: 'A mysterious lake area with unique creatures',
        position: { x: -150, y: 0, z: 250 },
        radius: 100,
        minLevel: 2,
        maxLevel: 4,
        mobs: [
            { type: 'goblin', weight: 50, minCount: 4, maxCount: 7, position: { x: -110, y: 0.5, z: 220 }, spawnRadius: 14 },
            { type: 'skeleton', weight: 50, minCount: 3, maxCount: 6, position: { x: -180, y: 0.5, z: 280 }, spawnRadius: 14 }
        ],
        miniBoss: { id: 'mistwalker', type: 'skeleton', name: 'The Mistwalker', levelBonus: 2, healthMultiplier: 3, damageMultiplier: 1.5, lootTableId: 'boss_loot_mistwalker', position: { x: -130, y: 0.5, z: 270 } }
    },
    {
        id: 'cursed_ruins',
        name: 'Cursed Ruins',
        description: 'Ancient ruins teeming with undead creatures',
        position: { x: 400, y: 0, z: -100 },
        radius: 130,
        minLevel: 6,
        maxLevel: 9,
        mobs: [
            { type: 'skeleton', weight: 50, minCount: 6, maxCount: 10, position: { x: 370, y: 0.5, z: -120 }, spawnRadius: 18 },
            { type: 'wraith', weight: 30, minCount: 3, maxCount: 5, activePhases: ['dusk', 'night'], position: { x: 430, y: 0.5, z: -140 }, spawnRadius: 16 },
            { type: 'necromancer', weight: 20, minCount: 1, maxCount: 3, position: { x: 410, y: 0.5, z: -70 }, spawnRadius: 14 }
        ],
        miniBoss: { id: 'vereth_bone_lord', type: 'necromancer', name: 'Vereth the Bone Lord', levelBonus: 2, healthMultiplier: 3.5, damageMultiplier: 1.7, lootTableId: 'boss_loot_vereth_bone_lord', position: { x: 420, y: 0.5, z: -120 } }
    },
    {
        id: 'dragon_peaks',
        name: 'Dragon Peaks',
        description: 'Treacherous mountain peaks where dragons roam',
        position: { x: -400, y: 0, z: 300 },
        radius: 160,
        minLevel: 8,
        maxLevel: 11,
        mobs: [
            { type: 'wyvern', weight: 40, minCount: 3, maxCount: 5, position: { x: -440, y: 0.5, z: 280 }, spawnRadius: 22 },
            { type: 'drake', weight: 40, minCount: 4, maxCount: 6, position: { x: -360, y: 0.5, z: 340 }, spawnRadius: 22 },
            { type: 'dragon', weight: 20, minCount: 1, maxCount: 2, position: { x: -380, y: 0.5, z: 260 }, spawnRadius: 20 }
        ],
        miniBoss: { id: 'vorthax_ember_wyrm', type: 'dragon', name: 'Vorthax the Ember Wyrm', levelBonus: 3, healthMultiplier: 4, damageMultiplier: 1.8, lootTableId: 'boss_loot_vorthax_ember_wyrm', position: { x: -400, y: 0.5, z: 300 } }
    },
    {
        id: 'shadow_valley',
        name: 'Shadow Valley',
        description: 'A dark valley filled with dangerous shadow creatures',
        position: { x: 300, y: 0, z: 400 },
        radius: 140,
        minLevel: 10,
        maxLevel: 12,
        mobs: [
            { type: 'shadowbeast', weight: 50, minCount: 5, maxCount: 8, packSize: 3, activePhases: ['dusk', 'night'], position: { x: 270, y: 0.5, z: 380 }, spawnRadius: 22 },
            { type: 'darkstalker', weight: 30, minCount: 3, maxCount: 5, activePhases: ['dusk', 'night'], position: { x: 340, y: 0.5, z: 430 }, spawnRadius: 20 },
            { type: 'voidwalker', weight: 20, minCount: 2, maxCount: 4, position: { x: 310, y: 0.5, z: 380 }, spawnRadius: 18 }
        ],
        miniBoss: { id: 'nyaraal', type: 'voidwalker', name: 'Nyaraal of the Hollow Path', levelBonus: 3, healthMultiplier: 4, damageMultiplier: 1.8, lootTableId: 'boss_loot_nyaraal', position: { x: 320, y: 0.5, z: 420 } }
    },
    {
        id: 'crystal_caverns',
        name: 'Crystal Caverns',
        description: 'Mysterious caverns filled with powerful crystal entities',
        position: { x: -300, y: 0, z: -400 },
        radius: 130,
        minLevel: 11,
        maxLevel: 14,
        mobs: [
            { type: 'crystal_golem', weight: 40, minCount: 4, maxCount: 7, position: { x: -280, y: 0.5, z: -380 }, spawnRadius: 20 },
            { type: 'crystal_elemental', weight: 40, minCount: 3, maxCount: 6, position: { x: -330, y: 0.5, z: -430 }, spawnRadius: 18 },
            { type: 'crystal_guardian', weight: 20, minCount: 1, maxCount: 3, position: { x: -290, y: 0.5, z: -430 }, spawnRadius: 14 }
        ],
        miniBoss: { id: 'prism_warden', type: 'crystal_guardian', name: 'The Prism Warden', levelBonus: 3, healthMultiplier: 4.2, damageMultiplier: 1.9, lootTableId: 'boss_loot_prism_warden', position: { x: -310, y: 0.5, z: -390 } }
    },
    // New expansive zones
    {
        id: 'volcanic_wastes',
        name: 'Volcanic Wastes',
        description: 'A scorching landscape of lava flows and fire elementals',
        position: { x: 500, y: 0, z: -300 },
        radius: 170,
        minLevel: 12,
        maxLevel: 16,
        mobs: [
            { type: 'fire_elemental', weight: 50, minCount: 6, maxCount: 10, packSize: 3, position: { x: 470, y: 0.5, z: -270 }, spawnRadius: 22 },
            { type: 'lava_golem', weight: 30, minCount: 3, maxCount: 6, position: { x: 540, y: 0.5, z: -340 }, spawnRadius: 22 },
            { type: 'flame_wraith', weight: 20, minCount: 2, maxCount: 4, position: { x: 510, y: 0.5, z: -260 }, spawnRadius: 18 }
        ],
        miniBoss: { id: 'magmaheart', type: 'lava_golem', name: 'Magmaheart, Forge Avatar', levelBonus: 3, healthMultiplier: 4.4, damageMultiplier: 2.0, lootTableId: 'boss_loot_magmaheart', position: { x: 510, y: 0.5, z: -300 } }
    },
    {
        id: 'frozen_tundra',
        name: 'Frozen Tundra',
        description: 'An icy wasteland where frost giants and ice creatures roam',
        position: { x: -500, y: 0, z: 500 },
        radius: 180,
        minLevel: 13,
        maxLevel: 17,
        mobs: [
            { type: 'ice_giant', weight: 30, minCount: 2, maxCount: 4, position: { x: -540, y: 0.5, z: 540 }, spawnRadius: 22 },
            { type: 'frost_wolf', weight: 40, minCount: 5, maxCount: 8, packSize: 4, position: { x: -460, y: 0.5, z: 480 }, spawnRadius: 22 },
            { type: 'ice_elemental', weight: 30, minCount: 4, maxCount: 7, position: { x: -510, y: 0.5, z: 460 }, spawnRadius: 20 }
        ],
        miniBoss: { id: 'skadrun', type: 'ice_giant', name: 'Skadrun, Tundra King', levelBonus: 3, healthMultiplier: 4.5, damageMultiplier: 2.0, lootTableId: 'boss_loot_skadrun', position: { x: -510, y: 0.5, z: 510 } }
    },
    {
        id: 'ethereal_gardens',
        name: 'Ethereal Gardens',
        description: 'Mystical floating gardens with magical creatures and ancient spirits',
        position: { x: 600, y: 0, z: 400 },
        radius: 160,
        minLevel: 15,
        maxLevel: 19,
        mobs: [
            { type: 'spirit_guardian', weight: 40, minCount: 4, maxCount: 7, position: { x: 580, y: 0.5, z: 380 }, spawnRadius: 22 },
            { type: 'ethereal_sprite', weight: 35, minCount: 6, maxCount: 10, packSize: 4, position: { x: 630, y: 0.5, z: 430 }, spawnRadius: 22 },
            { type: 'ancient_treant', weight: 25, minCount: 2, maxCount: 4, position: { x: 610, y: 0.5, z: 380 }, spawnRadius: 20 }
        ],
        miniBoss: { id: 'elder_vinebrook', type: 'ancient_treant', name: 'Elder Vinebrook', levelBonus: 3, healthMultiplier: 4.5, damageMultiplier: 2.0, lootTableId: 'boss_loot_elder_vinebrook', position: { x: 610, y: 0.5, z: 410 } }
    },
    {
        id: 'abyssal_depths',
        name: 'Abyssal Depths',
        description: 'Dark underwater caverns filled with eldritch horrors and ancient evils',
        position: { x: -600, y: 0, z: -600 },
        radius: 200,
        minLevel: 18,
        maxLevel: 22,
        mobs: [
            { type: 'deep_leviathan', weight: 20, minCount: 1, maxCount: 2, position: { x: -620, y: 0.5, z: -640 }, spawnRadius: 26 },
            { type: 'tentacle_horror', weight: 40, minCount: 3, maxCount: 6, position: { x: -580, y: 0.5, z: -560 }, spawnRadius: 24 },
            { type: 'void_spawner', weight: 40, minCount: 4, maxCount: 8, packSize: 3, position: { x: -630, y: 0.5, z: -570 }, spawnRadius: 24 }
        ],
        miniBoss: { id: 'cthulun', type: 'deep_leviathan', name: 'Cthulun, the Drowned King', levelBonus: 4, healthMultiplier: 5, damageMultiplier: 2.2, lootTableId: 'boss_loot_cthulun', position: { x: -600, y: 0.5, z: -600 } }
    },
    {
        id: 'celestial_peaks',
        name: 'Celestial Peaks',
        description: 'Sky-touching mountains where celestial beings and star guardians dwell',
        position: { x: 700, y: 0, z: -500 },
        radius: 190,
        minLevel: 20,
        maxLevel: 25,
        mobs: [
            { type: 'celestial_guardian', weight: 30, minCount: 2, maxCount: 4, position: { x: 680, y: 0.5, z: -520 }, spawnRadius: 24 },
            { type: 'star_weaver', weight: 40, minCount: 3, maxCount: 6, position: { x: 740, y: 0.5, z: -480 }, spawnRadius: 24 },
            { type: 'radiant_seraph', weight: 30, minCount: 2, maxCount: 5, position: { x: 700, y: 0.5, z: -460 }, spawnRadius: 22 }
        ],
        miniBoss: { id: 'auriel', type: 'radiant_seraph', name: 'Auriel of the First Dawn', levelBonus: 4, healthMultiplier: 5, damageMultiplier: 2.2, lootTableId: 'boss_loot_auriel', position: { x: 720, y: 0.5, z: -500 } }
    },
    {
        id: 'temporal_rifts',
        name: 'Temporal Rifts',
        description: 'Unstable zones where time itself is distorted, harboring chrono-entities',
        position: { x: -700, y: 0, z: 700 },
        radius: 150,
        minLevel: 23,
        maxLevel: 30,
        mobs: [
            { type: 'time_wraith', weight: 35, minCount: 3, maxCount: 6, position: { x: -730, y: 0.5, z: 680 }, spawnRadius: 20 },
            { type: 'chrono_stalker', weight: 35, minCount: 4, maxCount: 7, packSize: 3, position: { x: -670, y: 0.5, z: 720 }, spawnRadius: 22 },
            { type: 'temporal_overlord', weight: 30, minCount: 1, maxCount: 3, position: { x: -700, y: 0.5, z: 740 }, spawnRadius: 20 }
        ],
        miniBoss: { id: 'aethariel', type: 'temporal_overlord', name: 'Aethariel, Warden of Hours', levelBonus: 5, healthMultiplier: 5.5, damageMultiplier: 2.4, lootTableId: 'boss_loot_aethariel', position: { x: -700, y: 0.5, z: 720 } }
    },
    {
        id: 'emerald_expanse',
        name: 'Emerald Expanse',
        description: 'A continent-scale sea of rolling grass, ancient roads, and far green horizons',
        position: { x: 90_000, y: 0, z: 150_000 },
        radius: 115_000,
        spawnExclusionRadius: 2_000,
        minLevel: 8,
        maxLevel: 18,
        mobs: getBiomeEncounterMobs('emerald_grassland')
    },
    {
        id: 'silverwood_ocean',
        name: 'Silverwood Ocean',
        description: 'An enormous forest where silver-barked trees turn the sky into a green cathedral',
        position: { x: -190_000, y: 0, z: 120_000 },
        radius: 140_000,
        spawnExclusionRadius: 2_500,
        minLevel: 14,
        maxLevel: 24,
        mobs: getBiomeEncounterMobs('silverwood_forest')
    },
    {
        id: 'sunspire_steppe',
        name: 'Sunspire Steppe',
        description: 'A huge golden steppe broken by sunlit stone spires and fire-scarred ridges',
        position: { x: 260_000, y: 0, z: -120_000 },
        radius: 150_000,
        spawnExclusionRadius: 3_000,
        minLevel: 18,
        maxLevel: 28,
        mobs: getBiomeEncounterMobs('sunspire_steppe')
    },
    {
        id: 'moonfall_highlands',
        name: 'Moonfall Highlands',
        description: 'A vast cold highland of pale cliffs, moonlit grass, and distant ruined keeps',
        position: { x: -320_000, y: 0, z: -260_000 },
        radius: 135_000,
        spawnExclusionRadius: 3_000,
        minLevel: 20,
        maxLevel: 32,
        mobs: getBiomeEncounterMobs('moonfall_highland')
    },
    {
        id: 'abyssal_march',
        name: 'Abyssal March',
        description: 'A near-endless dark wetland where blue lights drift over black water and old stones',
        position: { x: 150_000, y: 0, z: 390_000 },
        radius: 125_000,
        spawnExclusionRadius: 2_500,
        minLevel: 24,
        maxLevel: 36,
        mobs: getBiomeEncounterMobs('abyssal_wetland')
    },
    {
        id: 'chronoglass_desert',
        name: 'Chronoglass Desert',
        description: 'An immense glassy desert where mirages bend time and stars shine in daylight',
        position: { x: -420_000, y: 0, z: 360_000 },
        radius: 130_000,
        spawnExclusionRadius: 2_500,
        minLevel: 28,
        maxLevel: 40,
        mobs: getBiomeEncounterMobs('chronoglass_desert')
    }
];
