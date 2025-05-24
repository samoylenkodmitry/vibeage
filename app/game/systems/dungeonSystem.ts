export interface DungeonRoom {
  id: string;
  name: string;
  description: string;
  dimensions: { width: number; height: number; depth: number };
  position: { x: number; y: number; z: number };
  mobs: {
    type: string;
    level: number;
    position: { x: number; y: number; z: number };
    respawnTime?: number;
  }[];
  loot: {
    itemId: string;
    position: { x: number; y: number; z: number };
    respawnTime?: number;
    guaranteed?: boolean;
  }[];
  obstacles: {
    type: 'wall' | 'pillar' | 'pit' | 'trap' | 'door' | 'chest';
    position: { x: number; y: number; z: number };
    dimensions: { width: number; height: number; depth: number };
    properties?: any;
  }[];
  lighting: {
    type: 'torch' | 'crystal' | 'magic' | 'none';
    intensity: number;
    color: string;
    positions: { x: number; y: number; z: number }[];
  };
  connections: {
    direction: 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
    targetRoomId: string;
    doorType: 'open' | 'locked' | 'hidden' | 'boss';
    requirements?: {
      keyId?: string;
      questId?: string;
      level?: number;
    };
  }[];
}

// Template interface for UI display
export interface DungeonTemplate {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  maxPlayers: number;
  difficulty: string;
  theme: string;
  timeLimit: number;
  rooms: Array<{
    name: string;
    loot: Array<{
      itemId: string;
      dropChance: number;
    }>;
  }>;
}

// Instance interface for active dungeons
export interface DungeonInstance {
  id: string;
  template: DungeonTemplate;
  players: string[];
  createdAt: number;
  timeLimit: number;
  maxPlayers: number;
  currentRoomIndex: number;
  state: 'active' | 'completed' | 'failed';
}

// System interface that DungeonUI expects
export interface DungeonSystem {
  getDungeonTemplates(): DungeonTemplate[];
  getActiveInstances(): DungeonInstance[];
  createInstance(dungeonId: string, playerId: string): string | null;
  joinInstance(instanceId: string, playerId: string): boolean;
  leaveInstance(instanceId: string, playerId: string): boolean;
  getInstance(instanceId: string): any;
}

export interface Dungeon {
  id: string;
  name: string;
  description: string;
  entryPosition: { x: number; y: number; z: number };
  exitPosition: { x: number; y: number; z: number };
  levelRange: { min: number; max: number };
  maxPlayers: number;
  timeLimit?: number; // in seconds
  difficulty: 'easy' | 'medium' | 'hard' | 'nightmare';
  theme: 'shadow' | 'fire' | 'ice' | 'crystal' | 'void' | 'celestial' | 'temporal';
  rooms: DungeonRoom[];
  rewards: {
    completion: {
      experience: number;
      items: { itemId: string; quantity: number; chance: number }[];
    };
    boss: {
      experience: number;
      items: { itemId: string; quantity: number; chance: number }[];
    };
  };
  mechanics: {
    respawnMobs: boolean;
    respawnLoot: boolean;
    resetOnEmpty: boolean;
    instanceLifetime: number; // seconds
  };
}

// Dungeon definitions
export const GAME_DUNGEONS: Dungeon[] = [
  {
    id: 'shadow_dungeon',
    name: 'Caverns of Eternal Shadow',
    description: 'Dark caverns where shadow creatures dwell in eternal darkness',
    entryPosition: { x: 0, y: 0, z: 0 },
    exitPosition: { x: 50, y: 0, z: 50 },
    levelRange: { min: 8, max: 12 },
    maxPlayers: 4,
    timeLimit: 3600, // 1 hour
    difficulty: 'medium',
    theme: 'shadow',
    rooms: [
      {
        id: 'entrance_hall',
        name: 'Entrance Hall',
        description: 'A dimly lit hall with ancient stone pillars',
        dimensions: { width: 20, height: 6, depth: 20 },
        position: { x: 0, y: 0, z: 0 },
        mobs: [
          { type: 'shadow_imp', level: 9, position: { x: -5, y: 0, z: 5 } },
          { type: 'shadow_imp', level: 9, position: { x: 5, y: 0, z: -5 } }
        ],
        loot: [
          { itemId: 'health_potion', position: { x: -8, y: 1, z: -8 } }
        ],
        obstacles: [
          { type: 'pillar', position: { x: -5, y: 0, z: 0 }, dimensions: { width: 2, height: 6, depth: 2 } },
          { type: 'pillar', position: { x: 5, y: 0, z: 0 }, dimensions: { width: 2, height: 6, depth: 2 } }
        ],
        lighting: {
          type: 'torch',
          intensity: 0.5,
          color: '#FF6B35',
          positions: [
            { x: -8, y: 4, z: -8 },
            { x: 8, y: 4, z: 8 }
          ]
        },
        connections: [
          { direction: 'north', targetRoomId: 'chamber_of_whispers', doorType: 'open' }
        ]
      },
      {
        id: 'chamber_of_whispers',
        name: 'Chamber of Whispers',
        description: 'Eerie whispers echo through this circular chamber',
        dimensions: { width: 15, height: 8, depth: 15 },
        position: { x: 0, y: 0, z: 25 },
        mobs: [
          { type: 'shadow_wraith', level: 10, position: { x: 0, y: 2, z: 0 } },
          { type: 'shadow_imp', level: 9, position: { x: -6, y: 0, z: 6 } },
          { type: 'shadow_imp', level: 9, position: { x: 6, y: 0, z: -6 } }
        ],
        loot: [
          { itemId: 'dark_essence', position: { x: 0, y: 1, z: 0 }, guaranteed: true }
        ],
        obstacles: [
          { type: 'chest', position: { x: 7, y: 0, z: 0 }, dimensions: { width: 1, height: 1, depth: 1 } }
        ],
        lighting: {
          type: 'magic',
          intensity: 0.3,
          color: '#8A2BE2',
          positions: [
            { x: 0, y: 6, z: 0 }
          ]
        },
        connections: [
          { direction: 'south', targetRoomId: 'entrance_hall', doorType: 'open' },
          { direction: 'east', targetRoomId: 'shadow_throne', doorType: 'locked', requirements: { keyId: 'shadow_key' } }
        ]
      },
      {
        id: 'shadow_throne',
        name: 'Shadow Throne Room',
        description: 'The lair of the Shadow Lord, wreathed in eternal darkness',
        dimensions: { width: 25, height: 12, depth: 25 },
        position: { x: 25, y: 0, z: 25 },
        mobs: [
          { type: 'shadow_lord', level: 12, position: { x: 0, y: 0, z: 10 } },
          { type: 'shadow_guardian', level: 11, position: { x: -8, y: 0, z: 5 } },
          { type: 'shadow_guardian', level: 11, position: { x: 8, y: 0, z: 5 } }
        ],
        loot: [
          { itemId: 'void_dagger', position: { x: 0, y: 1, z: 12 }, guaranteed: true }
        ],
        obstacles: [
          { type: 'wall', position: { x: 0, y: 0, z: -12 }, dimensions: { width: 25, height: 12, depth: 1 } },
          { type: 'chest', position: { x: 10, y: 0, z: 10 }, dimensions: { width: 2, height: 2, depth: 2 } }
        ],
        lighting: {
          type: 'crystal',
          intensity: 0.8,
          color: '#4B0082',
          positions: [
            { x: -10, y: 8, z: 0 },
            { x: 10, y: 8, z: 0 },
            { x: 0, y: 10, z: 10 }
          ]
        },
        connections: [
          { direction: 'west', targetRoomId: 'chamber_of_whispers', doorType: 'open' }
        ]
      }
    ],
    rewards: {
      completion: {
        experience: 1500,
        items: [
          { itemId: 'dark_essence', quantity: 5, chance: 100 },
          { itemId: 'shadow_crystal', quantity: 1, chance: 80 },
          { itemId: 'void_dagger', quantity: 1, chance: 50 }
        ]
      },
      boss: {
        experience: 800,
        items: [
          { itemId: 'shadow_lord_crown', quantity: 1, chance: 25 },
          { itemId: 'void_dagger', quantity: 1, chance: 100 },
          { itemId: 'dark_essence', quantity: 10, chance: 100 }
        ]
      }
    },
    mechanics: {
      respawnMobs: false,
      respawnLoot: false,
      resetOnEmpty: true,
      instanceLifetime: 7200 // 2 hours
    }
  },
  {
    id: 'fire_caverns',
    name: 'Molten Fire Caverns',
    description: 'Blazing caverns filled with lava and fire elementals',
    entryPosition: { x: 0, y: 0, z: 0 },
    exitPosition: { x: 60, y: 0, z: 40 },
    levelRange: { min: 12, max: 18 },
    maxPlayers: 5,
    timeLimit: 4800, // 80 minutes
    difficulty: 'hard',
    theme: 'fire',
    rooms: [
      {
        id: 'lava_entrance',
        name: 'Lava Entrance',
        description: 'The air shimmers with heat as lava pools bubble nearby',
        dimensions: { width: 18, height: 8, depth: 18 },
        position: { x: 0, y: 0, z: 0 },
        mobs: [
          { type: 'fire_imp', level: 13, position: { x: -6, y: 0, z: 6 } },
          { type: 'fire_imp', level: 13, position: { x: 6, y: 0, z: -6 } },
          { type: 'flame_sprite', level: 12, position: { x: 0, y: 3, z: 0 } }
        ],
        loot: [
          { itemId: 'fire_gem', position: { x: 8, y: 1, z: 8 } }
        ],
        obstacles: [
          { type: 'pit', position: { x: -4, y: -1, z: -4 }, dimensions: { width: 3, height: 2, depth: 3 } },
          { type: 'pit', position: { x: 4, y: -1, z: 4 }, dimensions: { width: 3, height: 2, depth: 3 } }
        ],
        lighting: {
          type: 'crystal',
          intensity: 1.2,
          color: '#FF4500',
          positions: [
            { x: 0, y: 6, z: 0 },
            { x: -8, y: 4, z: 8 },
            { x: 8, y: 4, z: -8 }
          ]
        },
        connections: [
          { direction: 'north', targetRoomId: 'forge_chamber', doorType: 'open' }
        ]
      },
      {
        id: 'forge_chamber',
        name: 'Ancient Forge',
        description: 'A massive forge where ancient weapons were once crafted',
        dimensions: { width: 22, height: 10, depth: 22 },
        position: { x: 0, y: 0, z: 30 },
        mobs: [
          { type: 'fire_elemental', level: 15, position: { x: 0, y: 0, z: 0 } },
          { type: 'lava_golem', level: 16, position: { x: -8, y: 0, z: 8 } },
          { type: 'flame_wraith', level: 14, position: { x: 8, y: 2, z: -8 } }
        ],
        loot: [
          { itemId: 'flame_blade', position: { x: 0, y: 2, z: 10 }, guaranteed: true },
          { itemId: 'fire_gem', position: { x: -10, y: 1, z: -10 } },
          { itemId: 'fire_gem', position: { x: 10, y: 1, z: 10 } }
        ],
        obstacles: [
          { type: 'chest', position: { x: 0, y: 0, z: -10 }, dimensions: { width: 2, height: 2, depth: 2 } },
          { type: 'pillar', position: { x: -6, y: 0, z: 0 }, dimensions: { width: 2, height: 10, depth: 2 } },
          { type: 'pillar', position: { x: 6, y: 0, z: 0 }, dimensions: { width: 2, height: 10, depth: 2 } }
        ],
        lighting: {
          type: 'torch',
          intensity: 1.5,
          color: '#FF6B35',
          positions: [
            { x: -10, y: 6, z: -10 },
            { x: 10, y: 6, z: -10 },
            { x: -10, y: 6, z: 10 },
            { x: 10, y: 6, z: 10 }
          ]
        },
        connections: [
          { direction: 'south', targetRoomId: 'lava_entrance', doorType: 'open' },
          { direction: 'east', targetRoomId: 'inferno_throne', doorType: 'boss' }
        ]
      },
      {
        id: 'inferno_throne',
        name: 'Inferno Throne',
        description: 'The blazing throne room of the Fire Lord',
        dimensions: { width: 30, height: 15, depth: 30 },
        position: { x: 30, y: 0, z: 30 },
        mobs: [
          { type: 'fire_lord', level: 18, position: { x: 0, y: 0, z: 12 } },
          { type: 'inferno_guardian', level: 17, position: { x: -10, y: 0, z: 8 } },
          { type: 'inferno_guardian', level: 17, position: { x: 10, y: 0, z: 8 } },
          { type: 'flame_phoenix', level: 16, position: { x: 0, y: 8, z: 0 } }
        ],
        loot: [
          { itemId: 'inferno_crown', position: { x: 0, y: 1, z: 15 }, guaranteed: true }
        ],
        obstacles: [
          { type: 'wall', position: { x: 0, y: 0, z: -15 }, dimensions: { width: 30, height: 15, depth: 1 } },
          { type: 'chest', position: { x: 12, y: 0, z: 12 }, dimensions: { width: 3, height: 3, depth: 3 } },
          { type: 'chest', position: { x: -12, y: 0, z: 12 }, dimensions: { width: 3, height: 3, depth: 3 } }
        ],
        lighting: {
          type: 'magic',
          intensity: 2.0,
          color: '#FF0000',
          positions: [
            { x: 0, y: 12, z: 12 },
            { x: -12, y: 10, z: 0 },
            { x: 12, y: 10, z: 0 }
          ]
        },
        connections: [
          { direction: 'west', targetRoomId: 'forge_chamber', doorType: 'open' }
        ]
      }
    ],
    rewards: {
      completion: {
        experience: 2500,
        items: [
          { itemId: 'fire_gem', quantity: 8, chance: 100 },
          { itemId: 'flame_blade', quantity: 1, chance: 100 },
          { itemId: 'inferno_crown', quantity: 1, chance: 60 }
        ]
      },
      boss: {
        experience: 1200,
        items: [
          { itemId: 'fire_lord_essence', quantity: 1, chance: 30 },
          { itemId: 'inferno_crown', quantity: 1, chance: 100 },
          { itemId: 'fire_gem', quantity: 15, chance: 100 },
          { itemId: 'phoenix_feather', quantity: 1, chance: 25 }
        ]
      }
    },
    mechanics: {
      respawnMobs: false,
      respawnLoot: false,
      resetOnEmpty: true,
      instanceLifetime: 10800 // 3 hours
    }
  },
  {
    id: 'ice_temple',
    name: 'Frozen Crystal Temple',
    description: 'An ancient temple encased in eternal ice and crystal formations',
    entryPosition: { x: 0, y: 0, z: 0 },
    exitPosition: { x: 45, y: 0, z: 60 },
    levelRange: { min: 14, max: 20 },
    maxPlayers: 6,
    timeLimit: 5400, // 90 minutes
    difficulty: 'hard',
    theme: 'ice',
    rooms: [
      {
        id: 'crystal_entrance',
        name: 'Crystal Entrance',
        description: 'Glittering ice crystals reflect light throughout this frozen hall',
        dimensions: { width: 20, height: 10, depth: 20 },
        position: { x: 0, y: 0, z: 0 },
        mobs: [
          { type: 'ice_shard', level: 15, position: { x: -7, y: 0, z: 7 } },
          { type: 'ice_shard', level: 15, position: { x: 7, y: 0, z: -7 } },
          { type: 'frost_sprite', level: 14, position: { x: 0, y: 4, z: 0 } }
        ],
        loot: [
          { itemId: 'ice_crystal', position: { x: 9, y: 1, z: 9 } }
        ],
        obstacles: [
          { type: 'pillar', position: { x: -5, y: 0, z: -5 }, dimensions: { width: 2, height: 10, depth: 2 } },
          { type: 'pillar', position: { x: 5, y: 0, z: 5 }, dimensions: { width: 2, height: 10, depth: 2 } }
        ],
        lighting: {
          type: 'crystal',
          intensity: 1.0,
          color: '#87CEEB',
          positions: [
            { x: 0, y: 8, z: 0 },
            { x: -9, y: 5, z: -9 },
            { x: 9, y: 5, z: 9 }
          ]
        },
        connections: [
          { direction: 'north', targetRoomId: 'frozen_library', doorType: 'open' }
        ]
      },
      {
        id: 'frozen_library',
        name: 'Frozen Library',
        description: 'Ancient tomes preserved in ice, containing forgotten knowledge',
        dimensions: { width: 25, height: 12, depth: 25 },
        position: { x: 0, y: 0, z: 35 },
        mobs: [
          { type: 'ice_elemental', level: 17, position: { x: 0, y: 0, z: 0 } },
          { type: 'frost_wraith', level: 16, position: { x: -10, y: 2, z: 10 } },
          { type: 'crystal_guardian', level: 18, position: { x: 10, y: 0, z: -10 } }
        ],
        loot: [
          { itemId: 'frost_tome', position: { x: 0, y: 2, z: 12 }, guaranteed: true },
          { itemId: 'ice_crystal', position: { x: -12, y: 1, z: -12 } },
          { itemId: 'mithril_ore', position: { x: 12, y: 1, z: 12 } }
        ],
        obstacles: [
          { type: 'chest', position: { x: 0, y: 0, z: -12 }, dimensions: { width: 2, height: 2, depth: 2 } },
          { type: 'wall', position: { x: -12, y: 0, z: 0 }, dimensions: { width: 1, height: 12, depth: 8 } },
          { type: 'wall', position: { x: 12, y: 0, z: 0 }, dimensions: { width: 1, height: 12, depth: 8 } }
        ],
        lighting: {
          type: 'magic',
          intensity: 0.8,
          color: '#B0E0E6',
          positions: [
            { x: 0, y: 10, z: 0 },
            { x: -10, y: 8, z: -10 },
            { x: 10, y: 8, z: 10 }
          ]
        },
        connections: [
          { direction: 'south', targetRoomId: 'crystal_entrance', doorType: 'open' },
          { direction: 'north', targetRoomId: 'ice_throne', doorType: 'locked', requirements: { keyId: 'frost_key' } }
        ]
      },
      {
        id: 'ice_throne',
        name: 'Throne of Eternal Winter',
        description: 'The frozen throne where the Ice Queen rules in eternal winter',
        dimensions: { width: 35, height: 18, depth: 35 },
        position: { x: 0, y: 0, z: 70 },
        mobs: [
          { type: 'ice_queen', level: 20, position: { x: 0, y: 0, z: 15 } },
          { type: 'frost_giant', level: 19, position: { x: -12, y: 0, z: 10 } },
          { type: 'frost_giant', level: 19, position: { x: 12, y: 0, z: 10 } },
          { type: 'ice_dragon', level: 18, position: { x: 0, y: 6, z: 5 } }
        ],
        loot: [
          { itemId: 'winter_crown', position: { x: 0, y: 1, z: 18 }, guaranteed: true }
        ],
        obstacles: [
          { type: 'wall', position: { x: 0, y: 0, z: -17 }, dimensions: { width: 35, height: 18, depth: 1 } },
          { type: 'chest', position: { x: 15, y: 0, z: 15 }, dimensions: { width: 3, height: 3, depth: 3 } },
          { type: 'chest', position: { x: -15, y: 0, z: 15 }, dimensions: { width: 3, height: 3, depth: 3 } }
        ],
        lighting: {
          type: 'crystal',
          intensity: 1.5,
          color: '#F0F8FF',
          positions: [
            { x: 0, y: 15, z: 15 },
            { x: -15, y: 12, z: 0 },
            { x: 15, y: 12, z: 0 },
            { x: 0, y: 10, z: -10 }
          ]
        },
        connections: [
          { direction: 'south', targetRoomId: 'frozen_library', doorType: 'open' }
        ]
      }
    ],
    rewards: {
      completion: {
        experience: 3000,
        items: [
          { itemId: 'ice_crystal', quantity: 10, chance: 100 },
          { itemId: 'frost_hammer', quantity: 1, chance: 100 },
          { itemId: 'winter_crown', quantity: 1, chance: 70 }
        ]
      },
      boss: {
        experience: 1500,
        items: [
          { itemId: 'ice_queen_scepter', quantity: 1, chance: 35 },
          { itemId: 'winter_crown', quantity: 1, chance: 100 },
          { itemId: 'ice_crystal', quantity: 20, chance: 100 },
          { itemId: 'dragon_scale', quantity: 1, chance: 30 }
        ]
      }
    },
    mechanics: {
      respawnMobs: false,
      respawnLoot: false,
      resetOnEmpty: true,
      instanceLifetime: 12600 // 3.5 hours
    }
  }
];

export class DungeonManager implements DungeonSystem {
  private activeInstances: Map<string, {
    dungeon: Dungeon;
    players: string[];
    createdAt: number;
    currentState: {
      [roomId: string]: {
        mobsKilled: string[];
        lootTaken: string[];
        doorsUnlocked: string[];
      };
    };
  }> = new Map();

  // Create a new dungeon instance
  createInstance(dungeonId: string, playerId: string): string | null {
    const dungeon = GAME_DUNGEONS.find(d => d.id === dungeonId);
    if (!dungeon) return null;

    const instanceId = `${dungeonId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.activeInstances.set(instanceId, {
      dungeon,
      players: [playerId],
      createdAt: Date.now(),
      currentState: this.initializeRoomStates(dungeon)
    });

    return instanceId;
  }

  // Join an existing dungeon instance
  joinInstance(instanceId: string, playerId: string): boolean {
    const instance = this.activeInstances.get(instanceId);
    if (!instance) return false;

    if (instance.players.length >= instance.dungeon.maxPlayers) return false;
    if (instance.players.includes(playerId)) return false;

    instance.players.push(playerId);
    return true;
  }

  // Leave a dungeon instance
  leaveInstance(instanceId: string, playerId: string): boolean {
    const instance = this.activeInstances.get(instanceId);
    if (!instance) return false;

    const playerIndex = instance.players.indexOf(playerId);
    if (playerIndex === -1) return false;

    instance.players.splice(playerIndex, 1);

    // Clean up empty instances
    if (instance.players.length === 0 && instance.dungeon.mechanics.resetOnEmpty) {
      this.activeInstances.delete(instanceId);
    }

    return true;
  }

  // Get dungeon instance data
  getInstance(instanceId: string) {
    return this.activeInstances.get(instanceId);
  }

  // Update room state (mob killed, loot taken, etc.)
  updateRoomState(instanceId: string, roomId: string, update: {
    mobKilled?: string;
    lootTaken?: string;
    doorUnlocked?: string;
  }): boolean {
    const instance = this.activeInstances.get(instanceId);
    if (!instance) return false;

    if (!instance.currentState[roomId]) {
      instance.currentState[roomId] = {
        mobsKilled: [],
        lootTaken: [],
        doorsUnlocked: []
      };
    }

    const roomState = instance.currentState[roomId];

    if (update.mobKilled) {
      roomState.mobsKilled.push(update.mobKilled);
    }

    if (update.lootTaken) {
      roomState.lootTaken.push(update.lootTaken);
    }

    if (update.doorUnlocked) {
      roomState.doorsUnlocked.push(update.doorUnlocked);
    }

    return true;
  }

  // Check if a door can be opened
  canOpenDoor(instanceId: string, roomId: string, direction: string, playerInventory: string[]): boolean {
    const instance = this.activeInstances.get(instanceId);
    if (!instance) return false;

    const room = instance.dungeon.rooms.find(r => r.id === roomId);
    if (!room) return false;

    const connection = room.connections.find(c => c.direction === direction);
    if (!connection) return false;

    switch (connection.doorType) {
      case 'open':
        return true;
      
      case 'locked':
        if (connection.requirements?.keyId) {
          return playerInventory.includes(connection.requirements.keyId);
        }
        return true;
      
      case 'hidden':
        // Could add discovery mechanics here
        return true;
      
      case 'boss': {
        // Check if all mobs in current room are defeated
        const roomState = instance.currentState[roomId];
        return roomState ? roomState.mobsKilled.length >= room.mobs.length : false;
      }
      
      default:
        return false;
    }
  }

  // Get available dungeons for a player level
  getAvailableDungeons(playerLevel: number): Dungeon[] {
    return GAME_DUNGEONS.filter(dungeon => 
      playerLevel >= dungeon.levelRange.min && 
      playerLevel <= dungeon.levelRange.max + 5 // Allow some level flexibility
    );
  }

  // Cleanup expired instances
  cleanupExpiredInstances(): void {
    const now = Date.now();
    
    for (const [instanceId, instance] of this.activeInstances.entries()) {
      const ageSeconds = (now - instance.createdAt) / 1000;
      
      if (ageSeconds > instance.dungeon.mechanics.instanceLifetime) {
        this.activeInstances.delete(instanceId);
      }
    }
  }

  // Get dungeon templates for UI display
  getDungeonTemplates(): DungeonTemplate[] {
    return GAME_DUNGEONS.map(dungeon => ({
      id: dungeon.id,
      name: dungeon.name,
      description: dungeon.description,
      requiredLevel: dungeon.levelRange.min,
      maxPlayers: dungeon.maxPlayers,
      difficulty: dungeon.difficulty,
      theme: dungeon.theme,
      timeLimit: dungeon.timeLimit || 3600,
      rooms: dungeon.rooms.map(room => ({
        name: room.name,
        loot: room.loot.map(loot => ({
          itemId: loot.itemId,
          dropChance: 0.5 // Default drop chance
        }))
      }))
    }));
  }

  private initializeRoomStates(dungeon: Dungeon): { [roomId: string]: any } {
    const states: { [roomId: string]: any } = {};
    
    for (const room of dungeon.rooms) {
      states[room.id] = {
        mobsKilled: [],
        lootTaken: [],
        doorsUnlocked: []
      };
    }
    
    return states;
  }

  // Get all active instances
  getActiveInstances(): DungeonInstance[] {
    return Array.from(this.activeInstances.entries()).map(([instanceId, instance]) => ({
      id: instanceId,
      template: {
        id: instance.dungeon.id,
        name: instance.dungeon.name,
        description: instance.dungeon.description,
        requiredLevel: instance.dungeon.levelRange.min,
        maxPlayers: instance.dungeon.maxPlayers,
        difficulty: instance.dungeon.difficulty,
        theme: instance.dungeon.theme,
        timeLimit: instance.dungeon.timeLimit || 3600,
        rooms: instance.dungeon.rooms.map(room => ({
          name: room.name,
          loot: room.loot.map(loot => ({
            itemId: loot.itemId,
            dropChance: 0.5
          }))
        }))
      },
      players: instance.players,
      createdAt: instance.createdAt,
      timeLimit: instance.dungeon.timeLimit || 3600,
      maxPlayers: instance.dungeon.maxPlayers,
      currentRoomIndex: 0, // Could be tracked properly later
      state: 'active' as const
    }));
  }
}

export const dungeonManager = new DungeonManager();
