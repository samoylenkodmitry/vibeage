import { CLASS_SKILL_TREES, type CharacterClass } from '../../packages/content/classes.js';
import { GRADE_MIN_LEVEL, occupiedSlotsForSpec, type EquipSlot, type ItemStatBlock } from '../../packages/content/equipmentTypes.js';
import { ITEMS, type ItemId } from '../../packages/content/items.js';
import { LOOT_TABLES, type LootTable } from '../../packages/content/lootTables.js';
import { MINI_BOSSES } from '../../packages/content/miniBosses.js';
import { QUEST_NPCS } from '../../packages/content/npcs.js';
import { meetsQuestPrerequisites, QUESTS, type QuestDef, type QuestId, type QuestVec3 } from '../../packages/content/quests.js';
import { PROFICIENCY_LEVEL, SPECIALIZATION_UNLOCK_LEVEL, SPECIALIZATIONS, type SpecializationId } from '../../packages/content/specializations.js';
import { SKILLS, type SkillId } from '../../packages/content/skills.js';
import { VENDORS } from '../../packages/content/vendors.js';
import { capSingleLevelAwardXP, getExperienceToNextLevel, starterSkillsFor } from '../players/playerProgression.js';
import { createSimulatedEnemy } from './gameSimulator.js';
import { estimateJourneyTravel } from './journeyTravel.js';
import type {
  JourneyBeat, JourneyBeatKind, JourneyLevelProgress, JourneyTimeBreakdown, JourneyVendorPurchase, JourneyWindowSummary,
  JourneyXpBreakdown, JourneyXpSource, PlayerJourneyOptions, PlayerJourneySummary,
} from './playerJourneyTypes.js';
import { runPveScenario, type PveScenarioDefinition } from './scenarioCatalog.js';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_HORIZON_HOURS = 24;
const DEFAULT_WINDOW_HOURS = 1;
const DEFAULT_MAX_LEVEL = 40;
const DEFAULT_TRAVEL_SPEED_MPS = 10;
const QUEST_INTERACTION_MS = 10_000;
const KILL_SEARCH_MS = 26_000;
const LOOT_PICKUP_MS = 4_000;
const DEATH_RECOVERY_MS = 90_000;
const BOSS_DURATION_MULTIPLIER = 4;
const GOLD_VALUE_BY_CURRENCY: Record<string, number> = { gold_coin: 1, platinum_coin: 100 };

const JOURNEY_ENEMY_BY_LEVEL: Array<{ minLevel: number; enemyType: string }> = [
  { minLevel: 40, enemyType: 'time_wraith' }, { minLevel: 35, enemyType: 'radiant_seraph' },
  { minLevel: 30, enemyType: 'rift_surveyor' }, { minLevel: 28, enemyType: 'frost_wolf' },
  { minLevel: 26, enemyType: 'brightglass_mote' }, { minLevel: 24, enemyType: 'road_thornback' },
  { minLevel: 22, enemyType: 'ash_dust_runner' }, { minLevel: 16, enemyType: 'fire_elemental' },
  { minLevel: 12, enemyType: 'shadowbeast' }, { minLevel: 9, enemyType: 'skeleton' },
  { minLevel: 7, enemyType: 'troll' }, { minLevel: 5, enemyType: 'wolf' }, { minLevel: 1, enemyType: 'goblin' },
];

type VendorUpgradeCandidate = {
  vendorId: string;
  itemId: ItemId;
  price: number;
  slot: EquipSlot;
  scoreGain: number;
};

type JourneyState = {
  className: CharacterClass;
  requestedSpecializationId?: SpecializationId;
  chosenSpecializationId?: SpecializationId;
  horizonMs: number;
  windowMs: number;
  maxLevel: number;
  travelSpeedMps: number;
  elapsedMs: number;
  level: number;
  experience: number;
  totalExperienceEarned: number;
  xpBySource: JourneyXpBreakdown;
  gold: number;
  kills: number;
  bossKills: number;
  deaths: number;
  position: QuestVec3;
  completedQuestIds: QuestId[];
  announcedQuestIds: Set<QuestId>;
  unlockedSkills: Set<SkillId>;
  inventoryExpected: Record<ItemId, number>;
  equippedItems: Partial<Record<EquipSlot, ItemId>>;
  vendorPurchases: JourneyVendorPurchase[];
  levelProgression: JourneyLevelProgress[];
  beats: JourneyBeat[];
  progressBeatKeys: Set<string>;
  time: JourneyTimeBreakdown;
};

const combatDurationCache = new Map<string, { durationMs: number; playerWon: boolean }>();

export function runPlayerJourney(options: PlayerJourneyOptions): PlayerJourneySummary {
  const state = createJourneyState(options);
  announceAvailableQuests(state);

  while (hasTimeRemaining(state) && shouldContinueJourney(state)) {
    const quest = nextAvailableQuest(state);
    if (quest) {
      if (!runQuest(state, quest)) break;
      buyAffordableUpgrades(state);
      announceAvailableQuests(state);
      continue;
    }
    if (!grindUntilQuestOrLevel(state)) break;
    buyAffordableUpgrades(state);
    announceAvailableQuests(state);
  }

  return summarizeJourney(state);
}

export function journeyReportRows(): PlayerJourneySummary[] {
  const classRows = (Object.keys(CLASS_SKILL_TREES) as CharacterClass[]).map((className) => (
    runPlayerJourney({ className, horizonHours: DEFAULT_HORIZON_HOURS })
  ));
  const specRows = Object.values(SPECIALIZATIONS).map((spec) => (
    runPlayerJourney({
      className: spec.baseClass,
      specializationId: spec.id,
      horizonHours: DEFAULT_HORIZON_HOURS,
    })
  ));
  return [...classRows, ...specRows];
}

function createJourneyState(options: PlayerJourneyOptions): JourneyState {
  const className = options.className;
  const unlockedSkills = new Set(starterSkillsFor(className));
  const beats: JourneyBeat[] = [{ atMs: 0, kind: 'start', label: 'Journey started', weight: 0 }];
  for (const skillId of unlockedSkills) {
    pushBeat(beats, 0, 'skill', `Starts with ${skillId}`, 1);
  }

  const state: JourneyState = {
    className,
    requestedSpecializationId: options.specializationId,
    horizonMs: (options.horizonHours ?? DEFAULT_HORIZON_HOURS) * HOUR_MS,
    windowMs: (options.windowHours ?? DEFAULT_WINDOW_HOURS) * HOUR_MS,
    maxLevel: options.maxLevel ?? DEFAULT_MAX_LEVEL,
    travelSpeedMps: options.travelSpeedMps ?? DEFAULT_TRAVEL_SPEED_MPS,
    elapsedMs: 0,
    level: 1,
    experience: 0,
    totalExperienceEarned: 0,
    xpBySource: emptyXpBreakdown(),
    gold: 0,
    kills: 0,
    bossKills: 0,
    deaths: 0,
    position: QUEST_NPCS.warden_galen?.position ?? { x: 0, y: 0.5, z: 0 },
    completedQuestIds: [],
    announcedQuestIds: new Set(),
    unlockedSkills,
    inventoryExpected: {},
    equippedItems: {},
    vendorPurchases: [],
    levelProgression: [],
    beats,
    progressBeatKeys: new Set(),
    time: { travelMs: 0, combatMs: 0, questMs: 0, lootMs: 0, downtimeMs: 0, vendorMs: 0 },
  };
  state.levelProgression.push(createLevelProgress(state, {
    source: 'start',
    xpThreshold: 0,
    awardLevelIndex: 0,
  }));
  return state;
}

function runQuest(state: JourneyState, quest: QuestDef): boolean {
  const npc = QUEST_NPCS[quest.npcId];
  if (npc && !travelTo(state, npc.position)) return false;
  if (!advanceTime(state, QUEST_INTERACTION_MS, 'questMs')) return false;

  for (const stage of quest.stages) {
    const objective = stage.objective;
    switch (objective.kind) {
      case 'talk': {
        const targetNpc = QUEST_NPCS[objective.npcId];
        if (targetNpc && !travelTo(state, targetNpc.position)) return false;
        if (!advanceTime(state, QUEST_INTERACTION_MS, 'questMs')) return false;
        break;
      }
      case 'manual':
        if (!advanceTime(state, QUEST_INTERACTION_MS, 'questMs')) return false;
        break;
      case 'reach':
        if (!travelTo(state, stage.marker ?? objective.position)) return false;
        if (!advanceTime(state, QUEST_INTERACTION_MS, 'questMs')) return false;
        break;
      case 'kill':
        for (let i = 0; i < objective.count; i += 1) {
          if (!killEnemy(state, objective.enemyType, Math.max(quest.minLevel, Math.min(state.level, quest.minLevel + 3)), false)) return false;
        }
        break;
      case 'kill_boss':
        if (!killBoss(state, objective.bossId, quest.minLevel)) return false;
        break;
      case 'specialize':
        chooseSpecialization(state);
        if (!advanceTime(state, QUEST_INTERACTION_MS, 'questMs')) return false;
        break;
    }
  }

  completeQuest(state, quest);
  return true;
}

function completeQuest(state: JourneyState, quest: QuestDef): void {
  state.completedQuestIds.push(quest.id);
  pushBeat(state.beats, state.elapsedMs, 'quest_complete', `Completed ${quest.name}`, 3);
  if (state.level >= state.maxLevel && quest.minLevel >= state.maxLevel - 5) {
    pushBeat(state.beats, state.elapsedMs, 'mastery_progress', `Mastery progress: ${quest.name}`, 2);
  }
  if ((quest.reward.items ?? []).length > 0 && quest.minLevel >= state.maxLevel - 10) {
    pushBeat(state.beats, state.elapsedMs, 'gear_progress', `Gear progress: ${quest.name}`, 1.5);
  }
  state.gold += quest.reward.gold ?? 0;
  for (const grant of quest.reward.items ?? []) {
    addExpectedItem(state, grant.itemId, grant.quantity ?? 1);
    maybeEquipItem(state, grant.itemId, 'quest');
  }
  addExperience(state, quest.reward.xp ?? 0, 'quest');
}

function killEnemy(state: JourneyState, enemyType: string, enemyLevel: number, isBoss: boolean): boolean {
  const outcome = combatOutcome(state, enemyType, enemyLevel, isBoss);
  const durationMs = isBoss ? outcome.durationMs * BOSS_DURATION_MULTIPLIER : outcome.durationMs;
  if (!advanceTime(state, durationMs, 'combatMs')) return false;

  if (!outcome.playerWon) {
    state.deaths += 1;
    pushBeat(state.beats, state.elapsedMs, 'death', `Died to ${enemyType}`, 3);
    return advanceTime(state, DEATH_RECOVERY_MS, 'downtimeMs');
  }

  if (!advanceTime(state, KILL_SEARCH_MS, 'downtimeMs')) return false;
  if (!advanceTime(state, LOOT_PICKUP_MS, 'lootMs')) return false;
  const enemy = createSimulatedEnemy(enemyType, enemyLevel, { isMiniBoss: isBoss, experienceMultiplier: isBoss ? 4 : undefined });
  addExpectedLoot(state, enemy.lootTableId);
  state.kills += 1;
  if (isBoss) state.bossKills += 1;
  addExperience(state, enemy.baseExperienceValue, isBoss ? 'boss' : 'mob');
  return true;
}

function killBoss(state: JourneyState, bossId: string, questMinLevel: number): boolean {
  const boss = MINI_BOSSES[bossId];
  if (!boss) {
    console.warn(`Missing boss definition for bossId: ${bossId}`);
    return advanceTime(state, QUEST_INTERACTION_MS, 'questMs');
  }
  if (!killEnemy(state, boss.mobType, Math.max(questMinLevel, Math.min(state.level, questMinLevel + 3)), true)) return false;
  addExpectedLoot(state, boss.lootTableId);
  addExpectedItem(state, boss.trophyItemId, 1);
  maybeEquipItem(state, boss.trophyItemId, 'loot');
  return true;
}

function grindUntilQuestOrLevel(state: JourneyState): boolean {
  const enemyType = levelAppropriateEnemyType(state.level);
  const enemyLevel = state.level;
  const cycleMs = combatOutcome(state, enemyType, enemyLevel, false).durationMs + KILL_SEARCH_MS + LOOT_PICKUP_MS;
  const enemy = createSimulatedEnemy(enemyType, enemyLevel);
  const xpToLevel = getExperienceToNextLevel(state.level) - state.experience;
  const killsToLevel = Math.max(1, Math.ceil(xpToLevel / Math.max(1, enemy.baseExperienceValue)));
  const killsToHorizon = Math.max(1, Math.floor((state.horizonMs - state.elapsedMs) / Math.max(1, cycleMs)));
  const kills = Math.min(killsToLevel, killsToHorizon);

  for (let i = 0; i < kills; i += 1) {
    if (!killEnemy(state, enemyType, enemyLevel, false)) return false;
    if (nextAvailableQuest(state)) break;
  }
  return true;
}

function combatOutcome(
  state: JourneyState,
  enemyType: string,
  enemyLevel: number,
  isBoss: boolean,
): { durationMs: number; playerWon: boolean } {
  const cacheKey = [
    state.className,
    state.chosenSpecializationId ?? 'base',
    state.level,
    enemyType,
    enemyLevel,
    isBoss ? 'boss' : 'mob',
  ].join(':');
  const cached = combatDurationCache.get(cacheKey);
  if (cached) return cached;

  const scenario: PveScenarioDefinition = {
    id: `journey-${cacheKey}`,
    className: state.className,
    specializationId: state.chosenSpecializationId,
    level: state.level,
    enemyType,
    enemyLevel,
  };
  const result = runPveScenario(scenario);
  const playerWon = result.summary.winnerTeamId === 'players' && !result.timedOut;
  const outcome = { durationMs: Math.max(1000, result.durationMs), playerWon };
  combatDurationCache.set(cacheKey, outcome);
  return outcome;
}

function addExperience(state: JourneyState, amount: number, source: Exclude<JourneyXpSource, 'start'>): void {
  const award = source === 'mob' || source === 'boss'
    ? capSingleLevelAwardXP({ level: state.level, experience: state.experience }, amount)
    : amount;
  if (award <= 0) return;
  state.totalExperienceEarned += award;
  state.xpBySource[source] += award;
  state.experience += award;
  let awardLevelIndex = 0;
  while (state.experience >= getExperienceToNextLevel(state.level) && state.level < state.maxLevel) {
    const xpThreshold = getExperienceToNextLevel(state.level);
    state.experience -= xpThreshold;
    state.level += 1;
    awardLevelIndex += 1;
    state.levelProgression.push(createLevelProgress(state, {
      source,
      xpThreshold,
      awardLevelIndex,
    }));
    pushBeat(state.beats, state.elapsedMs, 'level', `Reached level ${state.level}`, 4);
    addUnlockBeats(state);
    announceAvailableQuests(state);
  }
}

function addUnlockBeats(state: JourneyState): void {
  for (const skillId of newlyUnlockedClassSkills(state.className, state.level, state.unlockedSkills)) {
    state.unlockedSkills.add(skillId);
    pushBeat(state.beats, state.elapsedMs, 'skill', `Unlocked ${skillId}`, 2);
  }
  if (state.level === SPECIALIZATION_UNLOCK_LEVEL) {
    pushBeat(state.beats, state.elapsedMs, 'specialization', 'Specialization choice available', 4);
  }
  if (state.level === PROFICIENCY_LEVEL) {
    pushBeat(state.beats, state.elapsedMs, 'proficiency', 'Proficiency tier available', 4);
    const spec = state.chosenSpecializationId ? SPECIALIZATIONS[state.chosenSpecializationId] : undefined;
    if (spec) {
      pushBeat(state.beats, state.elapsedMs, 'proficiency', `Passive active: ${spec.proficiencyPassive.name}`, 2);
      for (const skillId of spec.proficiencySkills ?? []) {
        state.unlockedSkills.add(skillId);
        pushBeat(state.beats, state.elapsedMs, 'skill', `Unlocked ${skillId}`, 2);
      }
    }
  }
}

function chooseSpecialization(state: JourneyState): void {
  const spec = resolveSpecialization(state.className, state.requestedSpecializationId);
  if (!spec || state.chosenSpecializationId) return;
  state.chosenSpecializationId = spec.id;
  pushBeat(state.beats, state.elapsedMs, 'specialization', `Specialization active: ${spec.name}`, 5);
  pushBeat(state.beats, state.elapsedMs, 'specialization', `Passive active: ${spec.specializationPassive.name}`, 2);
  for (const skillId of spec.specSkills ?? []) {
    state.unlockedSkills.add(skillId);
    pushBeat(state.beats, state.elapsedMs, 'skill', `Unlocked ${skillId}`, 2);
  }
}

function buyAffordableUpgrades(state: JourneyState): void {
  let bought = true;
  while (bought && hasTimeRemaining(state)) {
    bought = false;
    const candidate = vendorUpgradeCandidates(state)
      .sort((a, b) => b.scoreGain - a.scoreGain || a.price - b.price || a.itemId.localeCompare(b.itemId))[0];
    if (!candidate) break;
    const vendor = VENDORS[candidate.vendorId];
    const npc = vendor ? QUEST_NPCS[vendor.npcId] : undefined;
    if (!vendor || !npc) break;
    if (!travelTo(state, npc.position)) return;
    if (!advanceTime(state, QUEST_INTERACTION_MS, 'vendorMs')) return;
    state.gold -= candidate.price;
    state.equippedItems[candidate.slot] = candidate.itemId;
    addExpectedItem(state, candidate.itemId, 1);
    state.vendorPurchases.push({
      atMs: state.elapsedMs,
      vendorId: candidate.vendorId,
      itemId: candidate.itemId,
      price: candidate.price,
      slot: candidate.slot,
      scoreGain: candidate.scoreGain,
    });
    pushBeat(state.beats, state.elapsedMs, 'vendor_purchase', `Bought ${candidate.itemId}`, 2);
    pushBeat(state.beats, state.elapsedMs, 'item_upgrade', `Equipped ${candidate.itemId}`, 3);
    bought = true;
  }
}

function vendorUpgradeCandidates(state: JourneyState): VendorUpgradeCandidate[] {
  return Object.values(VENDORS).flatMap((vendor) => (
    vendor.stock
      .map((stock) => upgradeCandidate(state, vendor.id, stock.itemId, stock.price))
      .filter((value): value is VendorUpgradeCandidate => Boolean(value))
  ));
}

function upgradeCandidate(state: JourneyState, vendorId: string, itemId: string, price: number): VendorUpgradeCandidate | null {
  if (price > state.gold) return null;
  const item = ITEMS[itemId];
  if (!item?.equip || !item.stats) return null;
  const requiredLevel = Math.max(GRADE_MIN_LEVEL[item.grade ?? 'none'] ?? 1, item.equip.requirements?.minLevel ?? 1);
  if (state.level < requiredLevel) return null;
  const slots = occupiedSlotsForSpec(item.equip);
  if (slots.length === 0) return null;
  const newScore = itemScore(item.stats);
  const currentScore = slots.reduce((total, slot) => total + itemScore(ITEMS[state.equippedItems[slot] ?? '']?.stats), 0);
  const scoreGain = newScore - currentScore;
  if (scoreGain <= 0) return null;
  return { vendorId, itemId, price, slot: slots[0]!, scoreGain };
}

function maybeEquipItem(state: JourneyState, itemId: ItemId, source: 'quest' | 'loot'): void {
  const item = ITEMS[itemId];
  if (!item?.equip || !item.stats) return;
  const candidate = upgradeCandidate(state, 'quest', itemId, 0);
  if (!candidate) return;
  state.equippedItems[candidate.slot] = itemId;
  pushBeat(state.beats, state.elapsedMs, 'item_upgrade', `Equipped ${itemId} from ${source}`, 3);
}

function addExpectedLoot(state: JourneyState, tableId?: string): void {
  const table = tableId ? LOOT_TABLES[tableId] : undefined;
  if (!table) return;
  for (const [itemId, quantity] of expectedDrops(table)) {
    const goldValue = GOLD_VALUE_BY_CURRENCY[itemId] ?? 0;
    if (goldValue > 0) state.gold += quantity * goldValue;
    else addExpectedItem(state, itemId, quantity);
  }
}

function expectedDrops(table: LootTable): Array<[ItemId, number]> {
  return table.drops.map((drop) => [
    drop.itemId,
    drop.chance * ((drop.quantity.min + drop.quantity.max) / 2),
  ]);
}

function addExpectedItem(state: JourneyState, itemId: ItemId, quantity: number): void {
  state.inventoryExpected[itemId] = (state.inventoryExpected[itemId] ?? 0) + quantity;
}

function announceAvailableQuests(state: JourneyState): void {
  for (const quest of availableQuests(state)) {
    if (state.announcedQuestIds.has(quest.id)) continue;
    state.announcedQuestIds.add(quest.id);
    pushBeat(state.beats, state.elapsedMs, 'quest_available', `Quest available: ${quest.name}`, 1.5);
  }
}

function nextAvailableQuest(state: JourneyState): QuestDef | null {
  return availableQuests(state)
    .sort((a, b) => a.minLevel - b.minLevel || a.id.localeCompare(b.id))[0] ?? null;
}

function availableQuests(state: JourneyState): QuestDef[] {
  return Object.values(QUESTS).filter((quest) => (
    quest.minLevel <= state.level
    && !state.completedQuestIds.includes(quest.id)
    && meetsQuestPrerequisites(quest, { completedQuests: state.completedQuestIds })
  ));
}

function travelTo(state: JourneyState, target: QuestVec3): boolean {
  const travel = estimateJourneyTravel(state.position, target, state.travelSpeedMps);
  const completed = advanceTime(state, travel.durationMs, 'travelMs', travel.label);
  if (completed) state.position = target;
  return completed;
}

function advanceTime(
  state: JourneyState,
  ms: number,
  bucket: keyof JourneyTimeBreakdown,
  progressLabel?: string,
): boolean {
  if (ms <= 0) return true;
  const remainingMs = state.horizonMs - state.elapsedMs;
  const usedMs = Math.min(ms, Math.max(0, remainingMs));
  const startMs = state.elapsedMs;
  state.elapsedMs += usedMs;
  state.time[bucket] += usedMs;
  addProgressBeatsForSegment(state, startMs, state.elapsedMs, bucket, progressLabel);
  return usedMs >= ms;
}

function addProgressBeatsForSegment(
  state: JourneyState,
  startMs: number,
  endMs: number,
  bucket: keyof JourneyTimeBreakdown,
  progressLabel?: string,
): void {
  if (endMs <= startMs) return;
  const kind = bucket === 'travelMs' ? 'travel_progress'
    : bucket === 'combatMs' || bucket === 'downtimeMs' || bucket === 'lootMs' ? 'hunt_progress' : null;
  if (!kind) return;
  const firstWindowIndex = Math.floor(startMs / state.windowMs);
  const lastWindowIndex = Math.floor(Math.max(startMs, endMs - 1) / state.windowMs);

  for (let index = firstWindowIndex; index <= lastWindowIndex; index += 1) {
    const key = `${kind}:${index}`;
    if (state.progressBeatKeys.has(key)) continue;
    const atMs = Math.max(startMs, index * state.windowMs) + 1;
    if (atMs >= state.horizonMs || atMs >= endMs) continue;
    state.progressBeatKeys.add(key);
    pushBeat(
      state.beats,
      atMs,
      kind,
      kind === 'travel_progress' ? (progressLabel ?? 'Route progress') : 'Sustained hunt progress',
      1,
    );
    if (state.level >= state.maxLevel) {
      const masteryKey = `mastery_progress:${index}`;
      if (!state.progressBeatKeys.has(masteryKey)) {
        state.progressBeatKeys.add(masteryKey);
        pushBeat(state.beats, atMs, 'mastery_progress', 'Mastery route progress', 1.5);
      }
    }
  }
}

function shouldContinueJourney(state: JourneyState): boolean {
  if (state.level < state.maxLevel) return true;
  return nextAvailableQuest(state) !== null;
}

function hasTimeRemaining(state: JourneyState): boolean {
  return state.elapsedMs < state.horizonMs;
}

function summarizeJourney(state: JourneyState): PlayerJourneySummary {
  const windows = summarizeWindows(state);
  const skippedQuestIds = Object.values(QUESTS)
    .filter((quest) => quest.minLevel <= state.level && !state.completedQuestIds.includes(quest.id))
    .map((quest) => quest.id);
  return {
    className: state.className,
    requestedSpecializationId: state.requestedSpecializationId,
    chosenSpecializationId: state.chosenSpecializationId,
    horizonHours: state.horizonMs / HOUR_MS,
    windowHours: state.windowMs / HOUR_MS,
    endingLevel: state.level,
    levelsGained: state.level - 1,
    experience: Math.floor(state.experience),
    experienceToNextLevel: getExperienceToNextLevel(state.level),
    totalExperienceEarned: Math.floor(state.totalExperienceEarned),
    xpBySource: copyXpBreakdown(state.xpBySource),
    gold: Math.floor(state.gold),
    kills: state.kills,
    bossKills: state.bossKills,
    deaths: state.deaths,
    skippedLevelCount: state.levelProgression.filter((report) => report.skippedBySingleAward).length,
    levelProgression: state.levelProgression.map((report) => ({
      ...report,
      xpBySource: copyXpBreakdown(report.xpBySource),
      questIdsCompleted: [...report.questIdsCompleted],
      inventoryExpected: { ...report.inventoryExpected },
      equippedItems: { ...report.equippedItems },
    })),
    questsCompleted: state.completedQuestIds.length,
    questIdsCompleted: [...state.completedQuestIds],
    skippedQuestIds,
    obsoleteQuestIds: skippedQuestIds.filter((questId) => (QUESTS[questId]?.minLevel ?? state.level) <= state.level - 5),
    inventoryExpected: roundRecord(state.inventoryExpected),
    equippedItems: { ...state.equippedItems },
    gearScore: gearScore(state.equippedItems),
    vendorPurchases: [...state.vendorPurchases],
    time: { ...state.time },
    emptyWindowCount: windows.filter((window) => window.isEmpty).length,
    maxMeaningfulGapHours: maxMeaningfulGap(state.beats, state.horizonMs) / HOUR_MS,
    beats: [...state.beats],
    windows,
  };
}

function summarizeWindows(state: JourneyState): JourneyWindowSummary[] {
  const windowCount = Math.max(1, Math.ceil(state.horizonMs / state.windowMs));
  return Array.from({ length: windowCount }, (_, index) => {
    const startMs = index * state.windowMs;
    const endMs = Math.min(state.horizonMs, startMs + state.windowMs);
    const beats = state.beats.filter((beat) => beat.weight > 0 && beat.atMs >= startMs && beat.atMs < endMs);
    const beatWeight = beats.reduce((total, beat) => total + beat.weight, 0);
    return {
      index,
      startHour: startMs / HOUR_MS,
      endHour: endMs / HOUR_MS,
      beatWeight,
      questCompletions: countKind(beats, 'quest_complete'),
      levelUps: countKind(beats, 'level'),
      itemUpgrades: countKind(beats, 'item_upgrade'),
      vendorPurchases: countKind(beats, 'vendor_purchase'),
      deaths: countKind(beats, 'death'),
      isEmpty: beatWeight <= 0,
    };
  });
}

function maxMeaningfulGap(beats: readonly JourneyBeat[], horizonMs: number): number {
  const times = beats.filter((beat) => beat.weight > 0).map((beat) => beat.atMs).sort((a, b) => a - b);
  if (times.length === 0) return horizonMs;
  let previous = 0;
  let maxGap = times[0] ?? 0;
  for (const time of times) {
    maxGap = Math.max(maxGap, time - previous);
    previous = time;
  }
  return Math.max(maxGap, horizonMs - previous);
}

function newlyUnlockedClassSkills(className: CharacterClass, level: number, unlocked: Set<SkillId>): SkillId[] {
  return Object.entries(CLASS_SKILL_TREES[className].skillProgression)
    .filter(([, req]) => req?.level === level)
    .map(([skillId]) => skillId as SkillId)
    .filter((skillId) => !unlocked.has(skillId) && Boolean(SKILLS[skillId]));
}

function resolveSpecialization(className: CharacterClass, requested?: SpecializationId) {
  if (requested && SPECIALIZATIONS[requested]?.baseClass === className) return SPECIALIZATIONS[requested];
  return Object.values(SPECIALIZATIONS).find((spec) => spec.baseClass === className);
}

function levelAppropriateEnemyType(level: number): string {
  return JOURNEY_ENEMY_BY_LEVEL.find((entry) => level >= entry.minLevel)?.enemyType ?? 'goblin';
}

function itemScore(stats?: ItemStatBlock): number {
  if (!stats) return 0;
  return (
    (stats.pAtk ?? 0)
    + (stats.mAtk ?? 0)
    + (stats.pDef ?? 0)
    + (stats.mDef ?? 0)
    + ((stats.hp ?? 0) / 10)
    + ((stats.mp ?? 0) / 10)
    + ((stats.critRate ?? 0) * 2)
    + ((stats.attackSpeed ?? 0) / 10)
    + ((stats.moveSpeed ?? 0) / 2)
  );
}

function gearScore(equipped: Partial<Record<EquipSlot, ItemId>>): number {
  return Math.round(Object.values(equipped).reduce((total, itemId) => total + itemScore(ITEMS[itemId]?.stats), 0));
}

function createLevelProgress(
  state: JourneyState,
  input: {
    source: JourneyXpSource;
    xpThreshold: number;
    awardLevelIndex: number;
  },
): JourneyLevelProgress {
  return {
    level: state.level,
    reachedAtMs: state.elapsedMs,
    reachedAtHour: state.elapsedMs / HOUR_MS,
    source: input.source,
    xpThreshold: input.xpThreshold,
    xpIntoLevel: Math.floor(state.experience),
    totalXpEarned: Math.floor(state.totalExperienceEarned),
    xpBySource: copyXpBreakdown(state.xpBySource),
    questsCompleted: state.completedQuestIds.length,
    questIdsCompleted: [...state.completedQuestIds],
    kills: state.kills,
    bossKills: state.bossKills,
    gold: Math.floor(state.gold),
    inventoryExpected: roundRecord(state.inventoryExpected),
    equippedItems: { ...state.equippedItems },
    gearScore: gearScore(state.equippedItems),
    awardLevelIndex: input.awardLevelIndex,
    skippedBySingleAward: input.awardLevelIndex > 1,
  };
}

function emptyXpBreakdown(): JourneyXpBreakdown {
  return { quest: 0, mob: 0, boss: 0 };
}

function copyXpBreakdown(breakdown: JourneyXpBreakdown): JourneyXpBreakdown {
  return {
    quest: Math.floor(breakdown.quest),
    mob: Math.floor(breakdown.mob),
    boss: Math.floor(breakdown.boss),
  };
}

function roundRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => [key, Math.round(value * 10) / 10]),
  );
}

function countKind(beats: readonly JourneyBeat[], kind: JourneyBeatKind): number {
  return beats.filter((beat) => beat.kind === kind).length;
}

function pushBeat(beats: JourneyBeat[], atMs: number, kind: JourneyBeatKind, label: string, weight: number): void {
  beats.push({ atMs, kind, label, weight });
}
