interface ZoneConfig {
  id: string;
  name: string;
  description: string;
  position: { x: number; y: number; z: number };
  radius: number;
  minLevel: number;
  maxLevel: number;
  mobs: {
    type: string;
    weight: number; // Spawn weight/probability
    minCount: number; // Minimum number of mobs
    maxCount: number; // Maximum number of mobs
  }[];
}

// Define different zones in the game world
export const GAME_ZONES: ZoneConfig[] = [
  {
    id: 'starter_meadow',
    name: 'Peaceful Meadows',
    description: 'A tranquil starting area with gentle slopes and scattered trees',
    position: { x: 0, y: 0, z: 0 },
    radius: 100,
    minLevel: 1,
    maxLevel: 3,
    mobs: [
      { type: 'goblin', weight: 70, minCount: 5, maxCount: 8 },
      { type: 'wolf', weight: 30, minCount: 2, maxCount: 4 }
    ]
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
      { type: 'wolf', weight: 40, minCount: 4, maxCount: 8 },
      { type: 'skeleton', weight: 40, minCount: 4, maxCount: 6 },
      { type: 'orc', weight: 20, minCount: 2, maxCount: 4 }
    ]
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
      { type: 'troll', weight: 40, minCount: 3, maxCount: 6 },
      { type: 'orc', weight: 60, minCount: 5, maxCount: 8 }
    ]
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
      { type: 'goblin', weight: 50, minCount: 4, maxCount: 7 },
      { type: 'skeleton', weight: 50, minCount: 3, maxCount: 6 }
    ]
  },
  // New high-level zones
  {
    id: 'cursed_ruins',
    name: 'Cursed Ruins',
    description: 'Ancient ruins teeming with undead creatures',
    position: { x: 400, y: 0, z: -100 },
    radius: 130,
    minLevel: 6,
    maxLevel: 9,
    mobs: [
      { type: 'skeleton', weight: 50, minCount: 6, maxCount: 10 },
      { type: 'wraith', weight: 30, minCount: 3, maxCount: 5 },
      { type: 'necromancer', weight: 20, minCount: 1, maxCount: 3 }
    ]
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
      { type: 'wyvern', weight: 40, minCount: 3, maxCount: 5 },
      { type: 'drake', weight: 40, minCount: 4, maxCount: 6 },
      { type: 'dragon', weight: 20, minCount: 1, maxCount: 2 }
    ]
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
      { type: 'shadowbeast', weight: 50, minCount: 5, maxCount: 8 },
      { type: 'darkstalker', weight: 30, minCount: 3, maxCount: 5 },
      { type: 'voidwalker', weight: 20, minCount: 2, maxCount: 4 }
    ]
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
      { type: 'crystal_golem', weight: 40, minCount: 4, maxCount: 7 },
      { type: 'crystal_elemental', weight: 40, minCount: 3, maxCount: 6 },
      { type: 'crystal_guardian', weight: 20, minCount: 1, maxCount: 3 }
    ]
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
      { type: 'fire_elemental', weight: 50, minCount: 6, maxCount: 10 },
      { type: 'lava_golem', weight: 30, minCount: 3, maxCount: 6 },
      { type: 'flame_wraith', weight: 20, minCount: 2, maxCount: 4 }
    ]
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
      { type: 'ice_giant', weight: 30, minCount: 2, maxCount: 4 },
      { type: 'frost_wolf', weight: 40, minCount: 5, maxCount: 8 },
      { type: 'ice_elemental', weight: 30, minCount: 4, maxCount: 7 }
    ]
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
      { type: 'spirit_guardian', weight: 40, minCount: 4, maxCount: 7 },
      { type: 'ethereal_sprite', weight: 35, minCount: 6, maxCount: 10 },
      { type: 'ancient_treant', weight: 25, minCount: 2, maxCount: 4 }
    ]
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
      { type: 'deep_leviathan', weight: 20, minCount: 1, maxCount: 2 },
      { type: 'tentacle_horror', weight: 40, minCount: 3, maxCount: 6 },
      { type: 'void_spawner', weight: 40, minCount: 4, maxCount: 8 }
    ]
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
      { type: 'celestial_guardian', weight: 30, minCount: 2, maxCount: 4 },
      { type: 'star_weaver', weight: 40, minCount: 3, maxCount: 6 },
      { type: 'radiant_seraph', weight: 30, minCount: 2, maxCount: 5 }
    ]
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
      { type: 'time_wraith', weight: 35, minCount: 3, maxCount: 6 },
      { type: 'chrono_stalker', weight: 35, minCount: 4, maxCount: 7 },
      { type: 'temporal_overlord', weight: 30, minCount: 1, maxCount: 3 }
    ]
  }
];

export class ZoneManager {
  private zones: Map<string, {
    config: ZoneConfig;
    currentMobs: {
      id: string;
      type: string;
      level: number;
      position: { x: number; y: number; z: number };
    }[];
  }> = new Map();

  constructor() {
    // Initialize zones
    GAME_ZONES.forEach(zoneConfig => {
      this.zones.set(zoneConfig.id, {
        config: zoneConfig,
        currentMobs: []
      });
    });
  }

  // Get zone by position
  getZoneAtPosition(position: { x: number; y: number; z: number }): ZoneConfig | null {
    for (const zone of GAME_ZONES) {
      const dx = zone.position.x - position.x;
      const dz = zone.position.z - position.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared <= zone.radius * zone.radius) {
        return zone;
      }
    }
    return null;
  }

  // Get random position within a zone
  getRandomPositionInZone(zoneId: string): { x: number; y: number; z: number } | null {
    const zone = this.zones.get(zoneId)?.config;
    if (!zone) return null;

    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * zone.radius;
    return {
      x: zone.position.x + Math.cos(angle) * distance,
      y: 0,
      z: zone.position.z + Math.sin(angle) * distance
    };
  }

  // Get mobs needed to spawn in a zone
  getMobsToSpawn(zoneId: string): { type: string; count: number }[] {
    const zone = this.zones.get(zoneId);
    if (!zone) return [];

    const currentCounts = new Map<string, number>();
    zone.currentMobs.forEach(mob => {
      currentCounts.set(mob.type, (currentCounts.get(mob.type) || 0) + 1);
    });

    return zone.config.mobs.map(mobConfig => {
      const current = currentCounts.get(mobConfig.type) || 0;
      const needed = Math.max(0, mobConfig.minCount - current);
      return { type: mobConfig.type, count: needed };
    });
  }

  // Update mob counts for a zone
  updateZoneMobs(zoneId: string, mobs: { id: string; type: string; level: number; position: { x: number; y: number; z: number } }[]) {
    const zone = this.zones.get(zoneId);
    if (zone) {
      zone.currentMobs = mobs;
    }
  }

  // Get appropriate level for a mob in a zone
  getMobLevel(zoneId: string): number {
    const zone = this.zones.get(zoneId)?.config;
    if (!zone) return 1;

    return Math.floor(zone.minLevel + Math.random() * (zone.maxLevel - zone.minLevel + 1));
  }

  // Get all zones
  getAllZones(): ZoneConfig[] {
    return GAME_ZONES;
  }
}

export const zoneManager = new ZoneManager();