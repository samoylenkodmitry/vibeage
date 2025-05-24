export interface WeatherCondition {
  id: string;
  name: string;
  description: string;
  effects: {
    visibility: number; // 0-1, where 1 is full visibility
    movementSpeed: number; // multiplier
    damage: number; // environmental damage per second
    healing: number; // environmental healing per second
    manaRegen: number; // mana regeneration multiplier
  };
  visualEffects: {
    fogDensity: number;
    fogColor: string;
    skyColor: string;
    lightIntensity: number;
    particles?: {
      type: 'rain' | 'snow' | 'ash' | 'sparkles' | 'mist';
      density: number;
      speed: number;
      color: string;
    };
  };
  duration: {
    min: number; // minimum duration in seconds
    max: number; // maximum duration in seconds
  };
  zoneRestrictions?: string[]; // zones where this weather can occur
}

export interface WorldEvent {
  id: string;
  name: string;
  description: string;
  type: 'beneficial' | 'neutral' | 'dangerous' | 'rare';
  effects: {
    experienceMultiplier?: number;
    lootMultiplier?: number;
    spawnRateMultiplier?: number;
    damageMultiplier?: number;
    healingMultiplier?: number;
  };
  conditions: {
    minPlayerCount?: number;
    maxPlayerCount?: number;
    timeOfDay?: 'day' | 'night' | 'dawn' | 'dusk';
    requiredWeather?: string[];
    zoneRestrictions?: string[];
    cooldown: number; // seconds before event can trigger again
  };
  duration: {
    min: number;
    max: number;
  };
  announcements: {
    start: string;
    progress?: string;
    end: string;
  };
  rarity: number; // 0-100, lower is rarer
}

// Weather conditions
export const WEATHER_CONDITIONS: WeatherCondition[] = [
  {
    id: 'clear',
    name: 'Clear Skies',
    description: 'Perfect weather with clear visibility',
    effects: {
      visibility: 1.0,
      movementSpeed: 1.0,
      damage: 0,
      healing: 0,
      manaRegen: 1.0
    },
    visualEffects: {
      fogDensity: 0,
      fogColor: '#FFFFFF',
      skyColor: '#87CEEB',
      lightIntensity: 1.0
    },
    duration: { min: 300, max: 600 } // 5-10 minutes
  },
  {
    id: 'light_rain',
    name: 'Light Rain',
    description: 'Gentle rain that refreshes the spirit',
    effects: {
      visibility: 0.8,
      movementSpeed: 0.95,
      damage: 0,
      healing: 1,
      manaRegen: 1.2
    },
    visualEffects: {
      fogDensity: 0.1,
      fogColor: '#B0C4DE',
      skyColor: '#696969',
      lightIntensity: 0.7,
      particles: {
        type: 'rain',
        density: 0.3,
        speed: 10,
        color: '#ADD8E6'
      }
    },
    duration: { min: 180, max: 360 }
  },
  {
    id: 'heavy_storm',
    name: 'Thunderstorm',
    description: 'A fierce storm with lightning and heavy rain',
    effects: {
      visibility: 0.4,
      movementSpeed: 0.7,
      damage: 2,
      healing: 0,
      manaRegen: 1.5
    },
    visualEffects: {
      fogDensity: 0.3,
      fogColor: '#2F4F4F',
      skyColor: '#36454F',
      lightIntensity: 0.3,
      particles: {
        type: 'rain',
        density: 0.8,
        speed: 20,
        color: '#4682B4'
      }
    },
    duration: { min: 120, max: 240 }
  },
  {
    id: 'blizzard',
    name: 'Blizzard',
    description: 'Harsh winds and freezing snow',
    effects: {
      visibility: 0.3,
      movementSpeed: 0.6,
      damage: 3,
      healing: 0,
      manaRegen: 0.8
    },
    visualEffects: {
      fogDensity: 0.5,
      fogColor: '#F0F8FF',
      skyColor: '#B0C4DE',
      lightIntensity: 0.5,
      particles: {
        type: 'snow',
        density: 0.9,
        speed: 15,
        color: '#FFFFFF'
      }
    },
    duration: { min: 150, max: 300 },
    zoneRestrictions: ['frozen_tundra', 'celestial_peaks']
  },
  {
    id: 'volcanic_ash',
    name: 'Ash Storm',
    description: 'Choking ash from volcanic activity',
    effects: {
      visibility: 0.5,
      movementSpeed: 0.8,
      damage: 4,
      healing: 0,
      manaRegen: 0.7
    },
    visualEffects: {
      fogDensity: 0.4,
      fogColor: '#696969',
      skyColor: '#8B0000',
      lightIntensity: 0.4,
      particles: {
        type: 'ash',
        density: 0.7,
        speed: 8,
        color: '#A9A9A9'
      }
    },
    duration: { min: 120, max: 180 },
    zoneRestrictions: ['volcanic_wastes', 'dragon_peaks']
  },
  {
    id: 'ethereal_mist',
    name: 'Ethereal Mist',
    description: 'Magical mist that enhances spiritual energy',
    effects: {
      visibility: 0.6,
      movementSpeed: 1.1,
      damage: 0,
      healing: 2,
      manaRegen: 2.0
    },
    visualEffects: {
      fogDensity: 0.3,
      fogColor: '#DDA0DD',
      skyColor: '#9370DB',
      lightIntensity: 0.8,
      particles: {
        type: 'sparkles',
        density: 0.4,
        speed: 3,
        color: '#FF69B4'
      }
    },
    duration: { min: 240, max: 480 },
    zoneRestrictions: ['ethereal_gardens', 'crystal_caverns']
  },
  {
    id: 'temporal_distortion',
    name: 'Temporal Distortion',
    description: 'Reality warps and time flows strangely',
    effects: {
      visibility: 0.7,
      movementSpeed: 1.3,
      damage: 1,
      healing: 0,
      manaRegen: 1.8
    },
    visualEffects: {
      fogDensity: 0.2,
      fogColor: '#8A2BE2',
      skyColor: '#4B0082',
      lightIntensity: 0.9,
      particles: {
        type: 'mist',
        density: 0.5,
        speed: 5,
        color: '#9370DB'
      }
    },
    duration: { min: 60, max: 120 },
    zoneRestrictions: ['temporal_rifts']
  },
  {
    id: 'shadow_eclipse',
    name: 'Shadow Eclipse',
    description: 'An unnatural eclipse that strengthens dark creatures',
    effects: {
      visibility: 0.2,
      movementSpeed: 0.9,
      damage: 5,
      healing: 0,
      manaRegen: 0.5
    },
    visualEffects: {
      fogDensity: 0.6,
      fogColor: '#2F2F2F',
      skyColor: '#191970',
      lightIntensity: 0.1
    },
    duration: { min: 300, max: 600 },
    zoneRestrictions: ['shadow_valley', 'cursed_ruins', 'abyssal_depths']
  }
];

// World events
export const WORLD_EVENTS: WorldEvent[] = [
  {
    id: 'experience_surge',
    name: 'Arcane Convergence',
    description: 'Magical energies converge, increasing experience gained',
    type: 'beneficial',
    effects: {
      experienceMultiplier: 2.0
    },
    conditions: {
      cooldown: 3600, // 1 hour
      timeOfDay: 'night'
    },
    duration: { min: 600, max: 900 }, // 10-15 minutes
    announcements: {
      start: "The arcane energies converge! Experience gains are doubled!",
      progress: "The magical convergence continues...",
      end: "The arcane energies disperse, returning to normal."
    },
    rarity: 30
  },
  {
    id: 'treasure_rain',
    name: 'Fortune\'s Blessing',
    description: 'Lady Luck smiles upon adventurers, increasing loot drops',
    type: 'beneficial',
    effects: {
      lootMultiplier: 1.5
    },
    conditions: {
      cooldown: 7200, // 2 hours
      requiredWeather: ['clear', 'light_rain']
    },
    duration: { min: 900, max: 1200 }, // 15-20 minutes
    announcements: {
      start: "Fortune's blessing descends! Loot drops are enhanced!",
      end: "Fortune's blessing fades away."
    },
    rarity: 25
  },
  {
    id: 'monster_invasion',
    name: 'Monster Surge',
    description: 'Monsters spawn more frequently and are more aggressive',
    type: 'dangerous',
    effects: {
      spawnRateMultiplier: 3.0,
      damageMultiplier: 1.2
    },
    conditions: {
      cooldown: 5400, // 1.5 hours
      timeOfDay: 'night'
    },
    duration: { min: 300, max: 600 }, // 5-10 minutes
    announcements: {
      start: "A dark energy stirs! Monsters surge across the land!",
      progress: "The monster surge continues! Stay alert!",
      end: "The dark energy subsides. The surge has ended."
    },
    rarity: 40
  },
  {
    id: 'healing_springs',
    name: 'Nature\'s Embrace',
    description: 'Natural healing is enhanced across all zones',
    type: 'beneficial',
    effects: {
      healingMultiplier: 2.5
    },
    conditions: {
      cooldown: 4800, // 1.33 hours
      timeOfDay: 'dawn',
      requiredWeather: ['clear', 'ethereal_mist']
    },
    duration: { min: 1200, max: 1800 }, // 20-30 minutes
    announcements: {
      start: "Nature's healing energy flows through the land!",
      end: "Nature's embrace slowly fades."
    },
    rarity: 35
  },
  {
    id: 'blood_moon',
    name: 'Blood Moon Rising',
    description: 'A crimson moon rises, making all creatures more dangerous but dropping better loot',
    type: 'dangerous',
    effects: {
      damageMultiplier: 1.5,
      lootMultiplier: 2.0,
      spawnRateMultiplier: 1.5
    },
    conditions: {
      cooldown: 10800, // 3 hours
      timeOfDay: 'night',
      requiredWeather: ['clear', 'shadow_eclipse']
    },
    duration: { min: 1800, max: 2400 }, // 30-40 minutes
    announcements: {
      start: "The Blood Moon rises! Danger and treasure await!",
      progress: "The Blood Moon's crimson light intensifies...",
      end: "The Blood Moon wanes. The night returns to normal."
    },
    rarity: 10
  },
  {
    id: 'ethereal_convergence',
    name: 'Ethereal Convergence',
    description: 'The veil between worlds thins, allowing rare ethereal creatures to appear',
    type: 'rare',
    effects: {
      spawnRateMultiplier: 0.5, // Fewer regular mobs
      experienceMultiplier: 3.0,
      lootMultiplier: 4.0
    },
    conditions: {
      cooldown: 14400, // 4 hours
      requiredWeather: ['ethereal_mist'],
      zoneRestrictions: ['ethereal_gardens', 'crystal_caverns', 'temporal_rifts']
    },
    duration: { min: 600, max: 900 }, // 10-15 minutes
    announcements: {
      start: "Reality shimmers! Ethereal beings emerge from beyond!",
      progress: "The ethereal convergence peaks! Seek the rare creatures!",
      end: "The ethereal beings fade back to their realm."
    },
    rarity: 5
  },
  {
    id: 'volcanic_eruption',
    name: 'Volcanic Eruption',
    description: 'Volcanic zones become extremely dangerous but yield rare fire gems',
    type: 'dangerous',
    effects: {
      damageMultiplier: 2.0,
      lootMultiplier: 3.0
    },
    conditions: {
      cooldown: 7200, // 2 hours
      zoneRestrictions: ['volcanic_wastes', 'dragon_peaks'],
      requiredWeather: ['volcanic_ash', 'clear']
    },
    duration: { min: 900, max: 1200 }, // 15-20 minutes
    announcements: {
      start: "The earth trembles! Volcanic eruptions rock the land!",
      progress: "Lava flows and ash fill the air! Beware the heat!",
      end: "The volcanic activity calms. The danger passes."
    },
    rarity: 20
  },
  {
    id: 'time_storm',
    name: 'Temporal Storm',
    description: 'Time flows chaotically, causing unpredictable effects',
    type: 'neutral',
    effects: {
      experienceMultiplier: 1.5,
      damageMultiplier: 1.3,
      healingMultiplier: 1.5
    },
    conditions: {
      cooldown: 9600, // 2.67 hours
      zoneRestrictions: ['temporal_rifts'],
      requiredWeather: ['temporal_distortion']
    },
    duration: { min: 300, max: 600 }, // 5-10 minutes
    announcements: {
      start: "Time itself goes wild! Prepare for chaos!",
      progress: "The temporal storm rages on! Time flows strangely!",
      end: "The temporal storm subsides. Time returns to normal."
    },
    rarity: 15
  }
];

export class WeatherEventManager {
  private currentWeather: WeatherCondition | null = null;
  private activeEvents: Map<string, WorldEvent> = new Map();
  private eventCooldowns: Map<string, number> = new Map();
  private weatherChangeTime: number = 0;
  private lastUpdateTime: number = Date.now();

  constructor() {
    // Start with clear weather
    this.currentWeather = WEATHER_CONDITIONS.find(w => w.id === 'clear') || null;
    this.weatherChangeTime = Date.now() + this.getRandomWeatherDuration();
  }

  update(): void {
    const now = Date.now();
    const deltaTime = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;

    // Update weather
    this.updateWeather();

    // Update events
    this.updateEvents(deltaTime);

    // Try to trigger new events
    this.tryTriggerEvents();
  }

  private updateWeather(): void {
    const now = Date.now();
    if (now >= this.weatherChangeTime) {
      this.changeWeather();
      this.weatherChangeTime = now + this.getRandomWeatherDuration();
    }
  }

  private changeWeather(): void {
    const availableWeather = WEATHER_CONDITIONS.filter(() => {
      // Add logic here to filter weather based on current zone, time, etc.
      return true; // For now, allow all weather
    });

    if (availableWeather.length === 0) return;

    // Weighted random selection (clear weather is more common)
    const weights = availableWeather.map(weather => {
      if (weather.id === 'clear') return 40;
      if (weather.id === 'light_rain') return 20;
      if (weather.zoneRestrictions) return 5; // Zone-specific weather is rarer
      return 10;
    });

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < availableWeather.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        this.currentWeather = availableWeather[i];
        break;
      }
    }
  }

  private getRandomWeatherDuration(): number {
    if (!this.currentWeather) return 300000; // 5 minutes default
    
    const { min, max } = this.currentWeather.duration;
    return (min + Math.random() * (max - min)) * 1000; // Convert to milliseconds
  }

  private updateEvents(deltaTime: number): void {
    // Update event cooldowns
    for (const [eventId, cooldown] of this.eventCooldowns.entries()) {
      const newCooldown = cooldown - deltaTime;
      if (newCooldown <= 0) {
        this.eventCooldowns.delete(eventId);
      } else {
        this.eventCooldowns.set(eventId, newCooldown);
      }
    }

    // Check if active events should end
    for (const [eventId] of this.activeEvents.entries()) {
      // This would need event start time tracking in a real implementation
      // For now, we'll use a simple random chance to end events
      if (Math.random() < 0.001) { // Small chance each update
        this.endEvent(eventId);
      }
    }
  }

  private tryTriggerEvents(): void {
    for (const event of WORLD_EVENTS) {
      if (this.canTriggerEvent(event)) {
        if (Math.random() * 100 < event.rarity / 10) { // Adjust trigger rate
          this.startEvent(event);
        }
      }
    }
  }

  private canTriggerEvent(event: WorldEvent): boolean {
    // Check if event is already active
    if (this.activeEvents.has(event.id)) return false;

    // Check cooldown
    if (this.eventCooldowns.has(event.id)) return false;

    // Check weather requirements
    if (event.conditions.requiredWeather && this.currentWeather) {
      if (!event.conditions.requiredWeather.includes(this.currentWeather.id)) {
        return false;
      }
    }

    // Add more condition checks here (time of day, player count, etc.)

    return true;
  }

  private startEvent(event: WorldEvent): void {
    this.activeEvents.set(event.id, event);
    console.log(`Event started: ${event.name} - ${event.announcements.start}`);
    
    // In a real implementation, you'd broadcast this to all players
  }

  private endEvent(eventId: string): void {
    const event = this.activeEvents.get(eventId);
    if (!event) return;

    this.activeEvents.delete(eventId);
    this.eventCooldowns.set(eventId, event.conditions.cooldown);
    
    console.log(`Event ended: ${event.name} - ${event.announcements.end}`);
    
    // In a real implementation, you'd broadcast this to all players
  }

  // Public getters
  getCurrentWeather(): WeatherCondition | null {
    return this.currentWeather;
  }

  getActiveEvents(): WorldEvent[] {
    return Array.from(this.activeEvents.values());
  }

  getWeatherEffects(): WeatherCondition['effects'] | null {
    return this.currentWeather?.effects || null;
  }

  getEventEffects(): WorldEvent['effects'] {
    const combinedEffects: WorldEvent['effects'] = {};
    
    for (const event of this.activeEvents.values()) {
      if (event.effects.experienceMultiplier) {
        combinedEffects.experienceMultiplier = 
          (combinedEffects.experienceMultiplier || 1) * event.effects.experienceMultiplier;
      }
      
      if (event.effects.lootMultiplier) {
        combinedEffects.lootMultiplier = 
          (combinedEffects.lootMultiplier || 1) * event.effects.lootMultiplier;
      }
      
      if (event.effects.spawnRateMultiplier) {
        combinedEffects.spawnRateMultiplier = 
          (combinedEffects.spawnRateMultiplier || 1) * event.effects.spawnRateMultiplier;
      }
      
      if (event.effects.damageMultiplier) {
        combinedEffects.damageMultiplier = 
          (combinedEffects.damageMultiplier || 1) * event.effects.damageMultiplier;
      }
      
      if (event.effects.healingMultiplier) {
        combinedEffects.healingMultiplier = 
          (combinedEffects.healingMultiplier || 1) * event.effects.healingMultiplier;
      }
    }
    
    return combinedEffects;
  }

  // Force weather change (for testing/admin purposes)
  setWeather(weatherId: string): boolean {
    const weather = WEATHER_CONDITIONS.find(w => w.id === weatherId);
    if (!weather) return false;
    
    this.currentWeather = weather;
    this.weatherChangeTime = Date.now() + this.getRandomWeatherDuration();
    return true;
  }

  // Force event trigger (for testing/admin purposes)
  triggerEvent(eventId: string): boolean {
    const event = WORLD_EVENTS.find(e => e.id === eventId);
    if (!event) return false;
    
    this.startEvent(event);
    return true;
  }
}

export const weatherEventManager = new WeatherEventManager();
