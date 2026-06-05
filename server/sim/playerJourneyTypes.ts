import type { CharacterClass } from '../../packages/content/classes.js';
import type { EquipSlot } from '../../packages/content/equipmentTypes.js';
import type { ItemId } from '../../packages/content/items.js';
import type { QuestId } from '../../packages/content/quests.js';
import type { SpecializationId } from '../../packages/content/specializations.js';

export type JourneyBeatKind =
  | 'start'
  | 'level'
  | 'skill'
  | 'quest_available'
  | 'quest_complete'
  | 'specialization'
  | 'proficiency'
  | 'item_upgrade'
  | 'vendor_purchase'
  | 'travel_progress'
  | 'hunt_progress'
  | 'death';

export type JourneyBeat = {
  atMs: number;
  kind: JourneyBeatKind;
  label: string;
  weight: number;
};

export type JourneyWindowSummary = {
  index: number;
  startHour: number;
  endHour: number;
  beatWeight: number;
  questCompletions: number;
  levelUps: number;
  itemUpgrades: number;
  vendorPurchases: number;
  deaths: number;
  isEmpty: boolean;
};

export type JourneyTimeBreakdown = {
  travelMs: number;
  combatMs: number;
  questMs: number;
  lootMs: number;
  downtimeMs: number;
  vendorMs: number;
};

export type JourneyVendorPurchase = {
  atMs: number;
  vendorId: string;
  itemId: ItemId;
  price: number;
  slot: EquipSlot;
  scoreGain: number;
};

export type JourneyXpSource = 'start' | 'quest' | 'mob' | 'boss';

export type JourneyXpBreakdown = {
  quest: number;
  mob: number;
  boss: number;
};

export type JourneyLevelProgress = {
  level: number;
  reachedAtMs: number;
  reachedAtHour: number;
  source: JourneyXpSource;
  xpThreshold: number;
  xpIntoLevel: number;
  totalXpEarned: number;
  xpBySource: JourneyXpBreakdown;
  questsCompleted: number;
  questIdsCompleted: QuestId[];
  kills: number;
  bossKills: number;
  gold: number;
  inventoryExpected: Record<ItemId, number>;
  equippedItems: Partial<Record<EquipSlot, ItemId>>;
  gearScore: number;
  awardLevelIndex: number;
  skippedBySingleAward: boolean;
};

export type PlayerJourneyOptions = {
  className: CharacterClass;
  specializationId?: SpecializationId;
  horizonHours?: number;
  windowHours?: number;
  maxLevel?: number;
  travelSpeedMps?: number;
};

export type PlayerJourneySummary = {
  className: CharacterClass;
  requestedSpecializationId?: SpecializationId;
  chosenSpecializationId?: SpecializationId;
  horizonHours: number;
  windowHours: number;
  endingLevel: number;
  levelsGained: number;
  experience: number;
  experienceToNextLevel: number;
  totalExperienceEarned: number;
  xpBySource: JourneyXpBreakdown;
  gold: number;
  kills: number;
  bossKills: number;
  deaths: number;
  skippedLevelCount: number;
  levelProgression: JourneyLevelProgress[];
  questsCompleted: number;
  questIdsCompleted: QuestId[];
  skippedQuestIds: QuestId[];
  obsoleteQuestIds: QuestId[];
  inventoryExpected: Record<ItemId, number>;
  equippedItems: Partial<Record<EquipSlot, ItemId>>;
  gearScore: number;
  vendorPurchases: JourneyVendorPurchase[];
  time: JourneyTimeBreakdown;
  emptyWindowCount: number;
  maxMeaningfulGapHours: number;
  beats: JourneyBeat[];
  windows: JourneyWindowSummary[];
};
