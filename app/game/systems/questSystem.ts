export interface Quest {
  id: string;
  title: string;
  description: string;
  type: 'kill' | 'collect' | 'escort' | 'explore' | 'interact';
  objectives: QuestObjective[];
  requirements?: {
    level?: number;
    completedQuests?: string[];
    items?: { itemId: string; quantity: number }[];
  };
  rewards: {
    experience: number;
    gold?: number;
    items?: { itemId: string; quantity: number }[];
  };
  repeatable?: boolean;
  timeLimit?: number; // in seconds
  zoneId?: string; // Optional zone restriction
}

export interface QuestObjective {
  id: string;
  type: 'kill' | 'collect' | 'interact' | 'reach_location';
  target: string; // mob type, item id, npc id, or location id
  currentCount: number;
  requiredCount: number;
  description: string;
  completed: boolean;
}

export interface NPC {
  id: string;
  name: string;
  title?: string;
  position: { x: number; y: number; z: number };
  zoneId: string;
  type: 'quest_giver' | 'merchant' | 'trainer' | 'guard' | 'scholar';
  appearance: {
    model: 'human' | 'elf' | 'dwarf' | 'orc' | 'mysterious';
    color: string;
    size: number;
  };
  dialogue: {
    greeting: string;
    questAvailable: string;
    questComplete: string;
    noQuests: string;
    farewell: string;
  };
  quests: string[]; // Quest IDs this NPC offers
  shop?: {
    items: { itemId: string; price: number; stock?: number }[];
    buyback: boolean;
  };
  services?: ('repair' | 'teleport' | 'training')[];
}

// Quest definitions
export const GAME_QUESTS: Quest[] = [
  // Starter Meadow Quests
  {
    id: 'goblin_menace',
    title: 'Goblin Menace',
    description: 'The peaceful meadows are being overrun by goblins. Help restore peace by eliminating the threat.',
    type: 'kill',
    objectives: [
      {
        id: 'kill_goblins',
        type: 'kill',
        target: 'goblin',
        currentCount: 0,
        requiredCount: 10,
        description: 'Defeat 10 goblins',
        completed: false
      }
    ],
    requirements: { level: 1 },
    rewards: {
      experience: 150,
      gold: 25,
      items: [{ itemId: 'health_potion', quantity: 3 }]
    },
    zoneId: 'starter_meadow'
  },
  {
    id: 'herb_collection',
    title: 'Herb Gathering',
    description: 'Old Martha needs common herbs for her healing potions. Gather some from the meadow.',
    type: 'collect',
    objectives: [
      {
        id: 'collect_herbs',
        type: 'collect',
        target: 'common_herb',
        currentCount: 0,
        requiredCount: 5,
        description: 'Collect 5 common herbs',
        completed: false
      }
    ],
    requirements: { level: 1 },
    rewards: {
      experience: 100,
      gold: 15,
      items: [{ itemId: 'mana_potion', quantity: 2 }]
    },
    repeatable: true,
    zoneId: 'starter_meadow'
  },

  // Dark Forest Quests
  {
    id: 'wolf_pack_leader',
    title: 'The Alpha Wolf',
    description: 'A massive wolf pack is terrorizing travelers. Find and defeat their alpha leader.',
    type: 'kill',
    objectives: [
      {
        id: 'find_alpha',
        type: 'kill',
        target: 'alpha_wolf',
        currentCount: 0,
        requiredCount: 1,
        description: 'Defeat the Alpha Wolf',
        completed: false
      },
      {
        id: 'kill_wolves',
        type: 'kill',
        target: 'wolf',
        currentCount: 0,
        requiredCount: 8,
        description: 'Defeat 8 wolves',
        completed: false
      }
    ],
    requirements: { level: 3, completedQuests: ['goblin_menace'] },
    rewards: {
      experience: 300,
      gold: 50,
      items: [{ itemId: 'wolf_pelt', quantity: 1 }, { itemId: 'flame_blade', quantity: 1 }]
    },
    zoneId: 'dark_forest'
  },
  {
    id: 'skeleton_keys',
    title: 'Ancient Keys',
    description: 'Skeletons in the dark forest guard ancient keys. Collect them for the village historian.',
    type: 'collect',
    objectives: [
      {
        id: 'collect_keys',
        type: 'collect',
        target: 'ancient_key',
        currentCount: 0,
        requiredCount: 3,
        description: 'Collect 3 ancient keys from skeletons',
        completed: false
      }
    ],
    requirements: { level: 4 },
    rewards: {
      experience: 250,
      gold: 40,
      items: [{ itemId: 'greater_health_potion', quantity: 2 }]
    },
    zoneId: 'dark_forest'
  },

  // Volcanic Wastes Quests
  {
    id: 'fire_gem_mining',
    title: 'Heart of the Volcano',
    description: 'The local smith needs rare fire gems from the volcanic wastes to forge legendary weapons.',
    type: 'collect',
    objectives: [
      {
        id: 'mine_fire_gems',
        type: 'collect',
        target: 'fire_gem',
        currentCount: 0,
        requiredCount: 10,
        description: 'Mine 10 fire gems',
        completed: false
      }
    ],
    requirements: { level: 12 },
    rewards: {
      experience: 800,
      gold: 150,
      items: [{ itemId: 'flame_blade', quantity: 1 }, { itemId: 'fire_gem', quantity: 5 }]
    },
    repeatable: true,
    zoneId: 'volcanic_wastes'
  },
  {
    id: 'elemental_essence',
    title: 'Elemental Mastery',
    description: 'Prove your strength against the fire elementals and collect their essence.',
    type: 'kill',
    objectives: [
      {
        id: 'defeat_elementals',
        type: 'kill',
        target: 'fire_elemental',
        currentCount: 0,
        requiredCount: 15,
        description: 'Defeat 15 fire elementals',
        completed: false
      },
      {
        id: 'collect_essence',
        type: 'collect',
        target: 'fire_essence',
        currentCount: 0,
        requiredCount: 5,
        description: 'Collect 5 fire essence',
        completed: false
      }
    ],
    requirements: { level: 14 },
    rewards: {
      experience: 1200,
      gold: 200,
      items: [{ itemId: 'elixir_of_strength', quantity: 3 }]
    },
    zoneId: 'volcanic_wastes'
  },

  // Ethereal Gardens Quests
  {
    id: 'mystical_flowers',
    title: 'Garden of Mysteries',
    description: 'The ethereal gardens hold mystical flowers with incredible magical properties.',
    type: 'collect',
    objectives: [
      {
        id: 'gather_flowers',
        type: 'collect',
        target: 'mystical_flower',
        currentCount: 0,
        requiredCount: 8,
        description: 'Gather 8 mystical flowers',
        completed: false
      }
    ],
    requirements: { level: 15 },
    rewards: {
      experience: 1000,
      gold: 180,
      items: [{ itemId: 'ethereal_dust', quantity: 10 }, { itemId: 'crystal_staff', quantity: 1 }]
    },
    repeatable: true,
    zoneId: 'ethereal_gardens'
  },
  {
    id: 'ancient_wisdom',
    title: 'Whispers of the Ancients',
    description: 'The ancient treants hold wisdom from ages past. Speak with them to learn their secrets.',
    type: 'interact',
    objectives: [
      {
        id: 'speak_treants',
        type: 'interact',
        target: 'ancient_treant',
        currentCount: 0,
        requiredCount: 3,
        description: 'Speak with 3 ancient treants',
        completed: false
      }
    ],
    requirements: { level: 18, completedQuests: ['mystical_flowers'] },
    rewards: {
      experience: 1500,
      gold: 250,
      items: [{ itemId: 'star_essence', quantity: 3 }]
    },
    zoneId: 'ethereal_gardens'
  },

  // Temporal Rifts Epic Quest Chain
  {
    id: 'temporal_investigation',
    title: 'Time Distortions',
    description: 'Strange temporal rifts have appeared. Investigate their source and eliminate the threat.',
    type: 'explore',
    objectives: [
      {
        id: 'explore_rifts',
        type: 'reach_location',
        target: 'temporal_center',
        currentCount: 0,
        requiredCount: 1,
        description: 'Reach the center of the temporal rifts',
        completed: false
      },
      {
        id: 'defeat_overlord',
        type: 'kill',
        target: 'temporal_overlord',
        currentCount: 0,
        requiredCount: 1,
        description: 'Defeat the Temporal Overlord',
        completed: false
      }
    ],
    requirements: { level: 25 },
    rewards: {
      experience: 3000,
      gold: 500,
      items: [{ itemId: 'temporal_shard', quantity: 5 }, { itemId: 'celestial_sword', quantity: 1 }]
    },
    timeLimit: 3600, // 1 hour
    zoneId: 'temporal_rifts'
  }
];

// NPC definitions
export const GAME_NPCS: NPC[] = [
  // Starter Meadow NPCs
  {
    id: 'village_guard_tom',
    name: 'Tom',
    title: 'Village Guard',
    position: { x: 25, y: 0, z: 25 },
    zoneId: 'starter_meadow',
    type: 'quest_giver',
    appearance: {
      model: 'human',
      color: '#8B4513',
      size: 1.8
    },
    dialogue: {
      greeting: "Greetings, traveler! The meadows have been quite dangerous lately.",
      questAvailable: "I have some urgent tasks that need attention. Are you willing to help?",
      questComplete: "Excellent work! The meadows are safer thanks to you.",
      noQuests: "All is peaceful for now, thanks to your help.",
      farewell: "Stay safe out there!"
    },
    quests: ['goblin_menace']
  },
  {
    id: 'old_martha',
    name: 'Martha',
    title: 'Village Herbalist',
    position: { x: -30, y: 0, z: 40 },
    zoneId: 'starter_meadow',
    type: 'quest_giver',
    appearance: {
      model: 'human',
      color: '#DDA0DD',
      size: 1.6
    },
    dialogue: {
      greeting: "Hello there, young one. I'm always in need of fresh herbs.",
      questAvailable: "Could you help me gather some herbs? I'll make it worth your while.",
      questComplete: "Perfect! These herbs will make wonderful potions.",
      noQuests: "I have enough herbs for now, but come back later!",
      farewell: "May the earth guide your path."
    },
    quests: ['herb_collection'],
    shop: {
      items: [
        { itemId: 'health_potion', price: 25 },
        { itemId: 'mana_potion', price: 30 },
        { itemId: 'common_herb', price: 5 }
      ],
      buyback: true
    }
  },

  // Dark Forest NPCs
  {
    id: 'ranger_jack',
    name: 'Jack',
    title: 'Forest Ranger',
    position: { x: 180, y: 0, z: 220 },
    zoneId: 'dark_forest',
    type: 'quest_giver',
    appearance: {
      model: 'human',
      color: '#228B22',
      size: 1.75
    },
    dialogue: {
      greeting: "The forest grows darker each day. We need brave souls like you.",
      questAvailable: "There's a wolf pack causing havoc. Think you can handle their leader?",
      questComplete: "The forest breathes easier with that threat gone. Well done!",
      noQuests: "The forest is calm for now, but stay vigilant.",
      farewell: "May the forest spirits protect you."
    },
    quests: ['wolf_pack_leader']
  },
  {
    id: 'scholar_edwin',
    name: 'Edwin',
    title: 'Village Historian',
    position: { x: 160, y: 0, z: 180 },
    zoneId: 'dark_forest',
    type: 'scholar',
    appearance: {
      model: 'human',
      color: '#4169E1',
      size: 1.7
    },
    dialogue: {
      greeting: "Ah, a fellow seeker of knowledge! These ruins hold many secrets.",
      questAvailable: "I'm researching ancient keys found in these parts. Could you acquire some?",
      questComplete: "Fascinating! These keys may unlock secrets of the past.",
      noQuests: "I'm still studying the artifacts you brought. Check back later.",
      farewell: "Knowledge is the greatest treasure!"
    },
    quests: ['skeleton_keys']
  },

  // Volcanic Wastes NPCs
  {
    id: 'master_smith_thor',
    name: 'Thor',
    title: 'Master Smith',
    position: { x: 480, y: 0, z: -280 },
    zoneId: 'volcanic_wastes',
    type: 'quest_giver',
    appearance: {
      model: 'dwarf',
      color: '#8B0000',
      size: 1.4
    },
    dialogue: {
      greeting: "The heat here reminds me of my forge! Perfect for smithing.",
      questAvailable: "I need fire gems to forge legendary weapons. Brave enough to mine some?",
      questComplete: "These gems burn with inner fire! Perfect for my craft.",
      noQuests: "My forge burns bright thanks to your gems!",
      farewell: "May your blade stay sharp!"
    },
    quests: ['fire_gem_mining'],
    shop: {
      items: [
        { itemId: 'flame_blade', price: 500 },
        { itemId: 'iron_sword', price: 100 },
        { itemId: 'fire_gem', price: 80 }
      ],
      buyback: true
    },
    services: ['repair']
  },
  {
    id: 'fire_mage_aria',
    name: 'Aria',
    title: 'Fire Mage',
    position: { x: 520, y: 0, z: -320 },
    zoneId: 'volcanic_wastes',
    type: 'trainer',
    appearance: {
      model: 'elf',
      color: '#FF4500',
      size: 1.65
    },
    dialogue: {
      greeting: "The elements bend to those who understand their nature.",
      questAvailable: "To master fire magic, you must prove yourself against fire elementals.",
      questComplete: "You have shown mastery over the flames. Well done!",
      noQuests: "Continue practicing with fire magic. Mastery takes time.",
      farewell: "Let the flames guide you."
    },
    quests: ['elemental_essence'],
    services: ['training']
  },

  // Ethereal Gardens NPCs
  {
    id: 'ethereal_guardian_luna',
    name: 'Luna',
    title: 'Ethereal Guardian',
    position: { x: 580, y: 0, z: 380 },
    zoneId: 'ethereal_gardens',
    type: 'quest_giver',
    appearance: {
      model: 'elf',
      color: '#DDA0DD',
      size: 1.7
    },
    dialogue: {
      greeting: "Welcome to the ethereal realm, traveler. Few mortals find their way here.",
      questAvailable: "The mystical flowers here hold great power. Would you gather some for me?",
      questComplete: "These flowers will preserve the garden's magic. Thank you.",
      noQuests: "The garden's balance is maintained for now.",
      farewell: "May the ethereal winds carry you safely."
    },
    quests: ['mystical_flowers']
  },
  {
    id: 'ancient_sage_elder',
    name: 'Elder Treewhisper',
    title: 'Ancient Sage',
    position: { x: 620, y: 0, z: 420 },
    zoneId: 'ethereal_gardens',
    type: 'scholar',
    appearance: {
      model: 'mysterious',
      color: '#90EE90',
      size: 2.0
    },
    dialogue: {
      greeting: "Young one... the trees have spoken of your arrival.",
      questAvailable: "The ancient treants hold wisdom from the first age. Seek them out.",
      questComplete: "You have heard the whispers of ages past. This knowledge is precious.",
      noQuests: "The ancient wisdom flows through you now. Use it well.",
      farewell: "The forest remembers..."
    },
    quests: ['ancient_wisdom']
  },

  // Temporal Rifts NPCs
  {
    id: 'chrono_researcher_zara',
    name: 'Zara',
    title: 'Chrono Researcher',
    position: { x: -680, y: 0, z: 680 },
    zoneId: 'temporal_rifts',
    type: 'quest_giver',
    appearance: {
      model: 'human',
      color: '#8A2BE2',
      size: 1.75
    },
    dialogue: {
      greeting: "Time itself is unraveling here. We must act quickly!",
      questAvailable: "The temporal rifts threaten reality itself. Will you help investigate?",
      questComplete: "You've done the impossible! Time will remember your heroism.",
      noQuests: "The timeline is stable... for now.",
      farewell: "Time will tell if we meet again."
    },
    quests: ['temporal_investigation'],
    shop: {
      items: [
        { itemId: 'temporal_shard', price: 200 },
        { itemId: 'star_essence', price: 150 },
        { itemId: 'celestial_sword', price: 1000 }
      ],
      buyback: false
    }
  }
];

export class QuestManager {
  private activeQuests: Map<string, Quest> = new Map();
  private completedQuests: Set<string> = new Set();
  private questProgress: Map<string, Quest> = new Map();
  // Player-specific quest tracking
  private playerActiveQuests: Map<string, Set<string>> = new Map();
  private playerCompletedQuests: Map<string, Set<string>> = new Map();

  // Get available quests for a player
  getAvailableQuests(playerLevel: number, completedQuests: string[]): Quest[] {
    return GAME_QUESTS.filter(quest => {
      // Check if already completed and not repeatable
      if (completedQuests.includes(quest.id) && !quest.repeatable) {
        return false;
      }

      // Check level requirement
      if (quest.requirements?.level && playerLevel < quest.requirements.level) {
        return false;
      }

      // Check prerequisite quests
      if (quest.requirements?.completedQuests) {
        const hasPrereqs = quest.requirements.completedQuests.every(reqQuest => 
          completedQuests.includes(reqQuest)
        );
        if (!hasPrereqs) return false;
      }

      return true;
    });
  }

  // Get quests available from a specific NPC
  getQuestsFromNPC(npcId: string, playerLevel: number, completedQuests: string[]): Quest[] {
    const npc = GAME_NPCS.find(n => n.id === npcId);
    if (!npc) return [];

    const availableQuests = this.getAvailableQuests(playerLevel, completedQuests);
    return availableQuests.filter(quest => npc.quests.includes(quest.id));
  }

  // Start a quest
  startQuest(questId: string): Quest | null {
    const quest = GAME_QUESTS.find(q => q.id === questId);
    if (!quest) return null;

    const questCopy = JSON.parse(JSON.stringify(quest));
    this.activeQuests.set(questId, questCopy);
    return questCopy;
  }

  // Update quest progress
  updateQuestProgress(questId: string, objectiveId: string, amount: number = 1): boolean {
    const quest = this.activeQuests.get(questId);
    if (!quest) return false;

    const objective = quest.objectives.find(obj => obj.id === objectiveId);
    if (!objective || objective.completed) return false;

    objective.currentCount = Math.min(objective.currentCount + amount, objective.requiredCount);
    objective.completed = objective.currentCount >= objective.requiredCount;

    // Check if quest is complete
    const isComplete = quest.objectives.every(obj => obj.completed);
    if (isComplete) {
      this.completeQuest(questId);
    }

    return true;
  }

  // Complete a quest
  completeQuest(questId: string): Quest | null {
    const quest = this.activeQuests.get(questId);
    if (!quest) return null;

    this.activeQuests.delete(questId);
    this.completedQuests.add(questId);
    
    return quest;
  }

  // Get active quests
  getActiveQuests(): Quest[] {
    return Array.from(this.activeQuests.values());
  }

  // Get completed quests
  getCompletedQuests(): string[] {
    return Array.from(this.completedQuests);
  }

  // Get quest by ID
  getQuest(questId: string): Quest | null {
    return GAME_QUESTS.find(q => q.id === questId) || null;
  }

  // Accept a quest for a specific player
  acceptQuest(playerId: string, questId: string): boolean {
    const quest = GAME_QUESTS.find(q => q.id === questId);
    if (!quest) return false;

    // Initialize player quest sets if they don't exist
    if (!this.playerActiveQuests.has(playerId)) {
      this.playerActiveQuests.set(playerId, new Set());
    }
    if (!this.playerCompletedQuests.has(playerId)) {
      this.playerCompletedQuests.set(playerId, new Set());
    }

    const playerActive = this.playerActiveQuests.get(playerId)!;
    const playerCompleted = this.playerCompletedQuests.get(playerId)!;

    // Check if already active or completed (and not repeatable)
    if (playerActive.has(questId) || (playerCompleted.has(questId) && !quest.repeatable)) {
      return false;
    }

    playerActive.add(questId);
    
    // Also add to global active quests for compatibility
    const questCopy = JSON.parse(JSON.stringify(quest));
    this.activeQuests.set(`${playerId}_${questId}`, questCopy);
    
    return true;
  }

  // Abandon a quest for a specific player
  abandonQuest(playerId: string, questId: string): boolean {
    const playerActive = this.playerActiveQuests.get(playerId);
    if (!playerActive || !playerActive.has(questId)) {
      return false;
    }

    playerActive.delete(questId);
    this.activeQuests.delete(`${playerId}_${questId}`);
    return true;
  }

  // Get active quests for a specific player
  getPlayerActiveQuests(playerId: string): Quest[] {
    const playerActive = this.playerActiveQuests.get(playerId);
    if (!playerActive) return [];

    const quests: Quest[] = [];
    playerActive.forEach(questId => {
      const quest = this.activeQuests.get(`${playerId}_${questId}`);
      if (quest) {
        quests.push(quest);
      }
    });
    return quests;
  }

  // Get completed quest IDs for a specific player
  getPlayerCompletedQuests(playerId: string): string[] {
    const playerCompleted = this.playerCompletedQuests.get(playerId);
    return playerCompleted ? Array.from(playerCompleted) : [];
  }

  // Get completed quest objects for a specific player
  getPlayerCompletedQuestObjects(playerId: string): Quest[] {
    const completedIds = this.getPlayerCompletedQuests(playerId);
    return completedIds.map(id => GAME_QUESTS.find(q => q.id === id)!).filter(Boolean);
  }

  // Progress a quest for a specific player
  progressQuest(playerId: string, questId: string, objectiveType: string, targetId: string, amount: number = 1): boolean {
    const questKey = `${playerId}_${questId}`;
    const quest = this.activeQuests.get(questKey);
    if (!quest) return false;

    const objective = quest.objectives.find(obj => 
      obj.type === objectiveType && obj.target === targetId && !obj.completed
    );
    if (!objective) return false;

    objective.currentCount = Math.min(objective.currentCount + amount, objective.requiredCount);
    objective.completed = objective.currentCount >= objective.requiredCount;

    // Check if quest is complete
    const isComplete = quest.objectives.every(obj => obj.completed);
    if (isComplete) {
      this.completePlayerQuest(playerId, questId);
    }

    return true;
  }

  // Complete a quest for a specific player
  completePlayerQuest(playerId: string, questId: string): Quest | null {
    const questKey = `${playerId}_${questId}`;
    const quest = this.activeQuests.get(questKey);
    if (!quest) return null;

    // Remove from active quests
    this.activeQuests.delete(questKey);
    const playerActive = this.playerActiveQuests.get(playerId);
    if (playerActive) {
      playerActive.delete(questId);
    }

    // Add to completed quests
    if (!this.playerCompletedQuests.has(playerId)) {
      this.playerCompletedQuests.set(playerId, new Set());
    }
    this.playerCompletedQuests.get(playerId)!.add(questId);

    return quest;
  }

  // Get available quests for a player (updated to use player-specific data)
  getPlayerAvailableQuests(playerId: string, playerLevel: number): Quest[] {
    const completedQuests = this.getPlayerCompletedQuests(playerId);
    return this.getAvailableQuests(playerLevel, completedQuests);
  }

  // Placeholder methods for NPC functionality (to be implemented later)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getNearbyNPCs(_playerPosition: {x: number, y: number, z: number}, _radius: number): NPC[] {
    // TODO: Implement spatial lookup for NPCs
    // Parameters will be used when implementing spatial queries
    return [];
  }

  getNPC(npcId: string): NPC | null {
    return GAME_NPCS.find(npc => npc.id === npcId) || null;
  }
}

export const questManager = new QuestManager();
export const QuestSystem = QuestManager;
