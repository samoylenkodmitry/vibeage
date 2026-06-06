import { ENEMY_TEMPLATES } from '../../packages/content/enemies.js';
import { GRADE_MIN_LEVEL, occupiedSlotsForSpec, type EquipSlot, type ItemStatBlock } from '../../packages/content/equipmentTypes.js';
import { ITEMS, type ItemId } from '../../packages/content/items.js';
import { LOOT_TABLES, type LootDrop, type LootTable } from '../../packages/content/lootTables.js';
import { QUESTS, type QuestDef } from '../../packages/content/quests.js';
import { VENDORS, vendorSellPriceFor } from '../../packages/content/vendors.js';
import { GAME_ZONES, type Zone, type ZoneMiniBoss, type ZoneMob } from '../../packages/content/zones.js';
import { journeyReportRows } from './playerJourney.js';
import type { PlayerJourneySummary } from './playerJourneyTypes.js';

export const ECONOMY_BUDGET_MAX_LEVEL = 40;
export const ECONOMY_BUDGET_BAND_SIZE = 5;
export const MAX_MOB_EXPECTED_VALUE_RATIO = 0.9;
export const MAX_MOB_JACKPOT_VALUE_RATIO = 1.8;
export const MAX_BOSS_EXPECTED_VALUE_RATIO = 1.5;
export const MAX_BOSS_JACKPOT_VALUE_RATIO = 3.0;
export const MAX_QUEST_GOLD_RATIO = 1.75;
export const MAX_JOURNEY_MEANINGFUL_GAP_HOURS = 1.05;

export type EconomyIssueSeverity = 'error' | 'warning';
export type LootEconomyRowKind = 'mob' | 'boss';

export type LootTableEconomyValue = {
  tableId: string;
  expectedCurrencyGold: number;
  expectedVendorValue: number;
  jackpotVendorValue: number;
  rareItemIds: ItemId[];
};

export type LootEconomyRow = LootTableEconomyValue & {
  kind: LootEconomyRowKind;
  zoneId: string;
  zoneName: string;
  enemyType: string;
  label: string;
  bossId?: string;
  level: number;
  budgetGold: number;
  expectedValueRatio: number;
  jackpotValueRatio: number;
  maxAllowedExpectedRatio: number;
  maxAllowedJackpotRatio: number;
};

export type QuestGoldBudgetRow = {
  questId: string;
  questName: string;
  minLevel: number;
  rewardGold: number;
  rewardItemValue: number;
  budgetGold: number;
  goldRatio: number;
};

export type JourneyGearCheckpointRow = {
  pathId: string;
  checkpointLevel: number;
  reachedLevel: number;
  reachedAtHour: number;
  gearScore: number;
  gold: number;
  equippedSlotCount: number;
  purchaseCount: number;
};

export type JourneyEconomyRow = {
  pathId: string;
  endingLevel: number;
  gold: number;
  gearScore: number;
  purchaseCount: number;
  emptyWindowCount: number;
  maxMeaningfulGapHours: number;
  skippedLevelCount: number;
  obsoleteQuestCount: number;
};

export type EconomyProgressionIssue = {
  severity: EconomyIssueSeverity;
  category: 'loot' | 'quest' | 'journey' | 'gear';
  message: string;
  refId: string;
};

const CURRENCY_VALUE_GOLD: Record<string, number> = {
  gold_coin: 1,
  platinum_coin: 100,
};

const GEAR_CHECKPOINTS = [5, 10, 20, 30, 40] as const;

const MIN_GEAR_SCORE_BY_CHECKPOINT: Record<(typeof GEAR_CHECKPOINTS)[number], number> = {
  5: 5,
  10: 30,
  20: 35,
  30: 45,
  40: 250,
};

export function economyBudgetGoldForLevel(level: number): number {
  return 250 + Math.max(1, level) * 120;
}

export function buildLootEconomyRows(zones: readonly Zone[] = GAME_ZONES): LootEconomyRow[] {
  return zones.flatMap((zone) => [
    ...zone.mobs.flatMap((mob) => mobLootRows(zone, mob)),
    ...(zone.miniBoss ? bossLootRows(zone, zone.miniBoss) : []),
  ]);
}

export function buildQuestGoldBudgetRows(quests: readonly QuestDef[] = Object.values(QUESTS)): QuestGoldBudgetRow[] {
  return quests.map((quest) => {
    const rewardGold = quest.reward.gold ?? 0;
    const rewardItemValue = sum((quest.reward.items ?? []).map((grant) => (
      (grant.quantity ?? 1) * itemVendorValue(grant.itemId)
    )));
    const budgetGold = economyBudgetGoldForLevel(quest.minLevel);
    return {
      questId: quest.id,
      questName: quest.name,
      minLevel: quest.minLevel,
      rewardGold,
      rewardItemValue,
      budgetGold,
      goldRatio: rewardGold / budgetGold,
    };
  });
}

export function buildJourneyEconomyRows(rows: readonly PlayerJourneySummary[] = journeyReportRows()): JourneyEconomyRow[] {
  return rows.map((row) => ({
    pathId: journeyPathId(row),
    endingLevel: row.endingLevel,
    gold: row.gold,
    gearScore: row.gearScore,
    purchaseCount: row.vendorPurchases.length,
    emptyWindowCount: row.emptyWindowCount,
    maxMeaningfulGapHours: roundMetric(row.maxMeaningfulGapHours),
    skippedLevelCount: row.skippedLevelCount,
    obsoleteQuestCount: row.obsoleteQuestIds.length,
  }));
}

export function buildJourneyGearCheckpointRows(
  rows: readonly PlayerJourneySummary[] = journeyReportRows(),
): JourneyGearCheckpointRow[] {
  return rows.flatMap((row) => GEAR_CHECKPOINTS.map((checkpointLevel) => {
    const progress = row.levelProgression.find((entry) => entry.level >= checkpointLevel)
      ?? row.levelProgression.at(-1);
    return {
      pathId: journeyPathId(row),
      checkpointLevel,
      reachedLevel: progress?.level ?? row.endingLevel,
      reachedAtHour: roundMetric(progress?.reachedAtHour ?? row.horizonHours),
      gearScore: progress?.gearScore ?? row.gearScore,
      gold: progress?.gold ?? row.gold,
      equippedSlotCount: Object.keys(progress?.equippedItems ?? row.equippedItems ?? {}).length,
      purchaseCount: row.vendorPurchases.filter((purchase) => (
        purchase.atMs <= (progress?.reachedAtMs ?? Number.MAX_SAFE_INTEGER)
      )).length,
    };
  }));
}

export function auditEconomyProgressionBudget(input: {
  lootRows?: readonly LootEconomyRow[];
  questRows?: readonly QuestGoldBudgetRow[];
  journeyRows?: readonly JourneyEconomyRow[];
  gearRows?: readonly JourneyGearCheckpointRow[];
} = {}): EconomyProgressionIssue[] {
  const lootRows = input.lootRows ?? buildLootEconomyRows();
  const questRows = input.questRows ?? buildQuestGoldBudgetRows();
  const journeySummaries = input.journeyRows ?? buildJourneyEconomyRows();
  const gearRows = input.gearRows ?? buildJourneyGearCheckpointRows();
  return [
    ...auditLootRows(lootRows),
    ...auditQuestRows(questRows),
    ...auditJourneyRows(journeySummaries),
    ...auditGearRows(gearRows),
  ];
}

export function economyOffenderReportRows(
  limit = 12,
  rows: readonly LootEconomyRow[] = buildLootEconomyRows(),
): LootEconomyRow[] {
  return [...rows]
    .sort((a, b) => (
      b.expectedValueRatio - a.expectedValueRatio
      || b.jackpotValueRatio - a.jackpotValueRatio
      || a.zoneId.localeCompare(b.zoneId)
      || a.enemyType.localeCompare(b.enemyType)
      || a.level - b.level
    ))
    .slice(0, limit);
}

export function questGoldOffenderReportRows(
  limit = 8,
  rows: readonly QuestGoldBudgetRow[] = buildQuestGoldBudgetRows(),
): QuestGoldBudgetRow[] {
  return [...rows]
    .sort((a, b) => (
      b.goldRatio - a.goldRatio
      || b.rewardGold - a.rewardGold
      || a.questId.localeCompare(b.questId)
    ))
    .slice(0, limit);
}

export function economyLevelBandSummaries(
  maxLevel = ECONOMY_BUDGET_MAX_LEVEL,
  rows: readonly LootEconomyRow[] = buildLootEconomyRows(),
  questRows: readonly QuestGoldBudgetRow[] = buildQuestGoldBudgetRows(),
): Array<{
  levelBand: string;
  minLevel: number;
  maxLevel: number;
  mobRows: number;
  bossRows: number;
  questCount: number;
  questGold: number;
  maxExpectedKillValue: number;
  maxJackpotKillValue: number;
  maxExpectedRatio: number;
}> {
  const summaries = [];
  for (let minLevel = 1; minLevel <= maxLevel; minLevel += ECONOMY_BUDGET_BAND_SIZE) {
    const maxBandLevel = Math.min(maxLevel, minLevel + ECONOMY_BUDGET_BAND_SIZE - 1);
    const inBand = rows.filter((row) => row.level >= minLevel && row.level <= maxBandLevel);
    const quests = questRows.filter((row) => row.minLevel >= minLevel && row.minLevel <= maxBandLevel);
    summaries.push({
      levelBand: `L${minLevel}-${maxBandLevel}`,
      minLevel,
      maxLevel: maxBandLevel,
      mobRows: inBand.filter((row) => row.kind === 'mob').length,
      bossRows: inBand.filter((row) => row.kind === 'boss').length,
      questCount: quests.length,
      questGold: sum(quests.map((row) => row.rewardGold)),
      maxExpectedKillValue: roundMetric(max(inBand.map((row) => row.expectedVendorValue))),
      maxJackpotKillValue: roundMetric(max(inBand.map((row) => row.jackpotVendorValue))),
      maxExpectedRatio: roundMetric(max(inBand.map((row) => row.expectedValueRatio))),
    });
  }
  return summaries;
}

function mobLootRows(zone: Zone, mob: ZoneMob): LootEconomyRow[] {
  const rows: LootEconomyRow[] = [];
  for (let level = zone.minLevel; level <= zone.maxLevel; level += 1) {
    const template = ENEMY_TEMPLATES[mob.type];
    rows.push(lootEconomyRow({
      kind: 'mob',
      zone,
      enemyType: mob.type,
      label: template?.displayName ?? mob.type,
      level,
      tableId: template?.lootTableId ?? `${mob.type}_loot`,
    }));
  }
  return rows;
}

function bossLootRows(zone: Zone, boss: ZoneMiniBoss): LootEconomyRow[] {
  const rows: LootEconomyRow[] = [];
  const levelBonus = boss.levelBonus ?? 2;
  for (let baseLevel = zone.minLevel; baseLevel <= zone.maxLevel; baseLevel += 1) {
    rows.push(lootEconomyRow({
      kind: 'boss',
      zone,
      enemyType: boss.type,
      bossId: boss.id,
      label: boss.name,
      level: baseLevel + levelBonus,
      tableId: boss.lootTableId ?? `${boss.type}_loot`,
    }));
  }
  return rows;
}

function lootEconomyRow(input: {
  kind: LootEconomyRowKind;
  zone: Zone;
  enemyType: string;
  label: string;
  level: number;
  tableId: string;
  bossId?: string;
}): LootEconomyRow {
  const value = lootTableEconomyValue(input.tableId);
  const budgetGold = economyBudgetGoldForLevel(input.level);
  return {
    ...value,
    kind: input.kind,
    zoneId: input.zone.id,
    zoneName: input.zone.name,
    enemyType: input.enemyType,
    label: input.label,
    bossId: input.bossId,
    level: input.level,
    budgetGold,
    expectedValueRatio: value.expectedVendorValue / budgetGold,
    jackpotValueRatio: value.jackpotVendorValue / budgetGold,
    maxAllowedExpectedRatio: input.kind === 'boss' ? MAX_BOSS_EXPECTED_VALUE_RATIO : MAX_MOB_EXPECTED_VALUE_RATIO,
    maxAllowedJackpotRatio: input.kind === 'boss' ? MAX_BOSS_JACKPOT_VALUE_RATIO : MAX_MOB_JACKPOT_VALUE_RATIO,
  };
}

function lootTableEconomyValue(tableId: string): LootTableEconomyValue {
  const table = LOOT_TABLES[tableId];
  if (!table) {
    return {
      tableId,
      expectedCurrencyGold: 0,
      expectedVendorValue: 0,
      jackpotVendorValue: 0,
      rareItemIds: [],
    };
  }
  return {
    tableId,
    expectedCurrencyGold: expectedCurrencyGold(table),
    expectedVendorValue: expectedVendorValue(table),
    jackpotVendorValue: jackpotVendorValue(table),
    rareItemIds: rareItemIds(table),
  };
}

function expectedCurrencyGold(table: LootTable): number {
  return roundMetric(sum(table.drops.map((drop) => (
    expectedQuantity(drop) * (CURRENCY_VALUE_GOLD[drop.itemId] ?? 0)
  ))));
}

function expectedVendorValue(table: LootTable): number {
  return roundMetric(sum(table.drops.map((drop) => expectedQuantity(drop) * itemVendorValue(drop.itemId))));
}

function jackpotVendorValue(table: LootTable): number {
  return roundMetric(sum(table.drops.map((drop) => drop.quantity.max * itemVendorValue(drop.itemId))));
}

function rareItemIds(table: LootTable): ItemId[] {
  return table.drops
    .filter((drop) => drop.chance <= 0.1 && itemVendorValue(drop.itemId) > 0)
    .map((drop) => drop.itemId);
}

function expectedQuantity(drop: LootDrop): number {
  return drop.chance * ((drop.quantity.min + drop.quantity.max) / 2);
}

function itemVendorValue(itemId: string): number {
  const currencyValue = CURRENCY_VALUE_GOLD[itemId];
  if (currencyValue !== undefined) return currencyValue;
  return Math.max(0, ...Object.values(VENDORS).map((vendor) => vendorSellPriceFor(vendor, itemId) ?? 0));
}

function auditLootRows(rows: readonly LootEconomyRow[]): EconomyProgressionIssue[] {
  const issues: EconomyProgressionIssue[] = [];
  for (const row of rows) {
    if (row.expectedValueRatio > row.maxAllowedExpectedRatio) {
      issues.push({
        severity: 'error',
        category: 'loot',
        refId: `${row.zoneId}/${row.enemyType}/L${row.level}`,
        message: `${row.label} L${row.level} expected drop value ${row.expectedVendorValue} exceeds ${(row.maxAllowedExpectedRatio * 100).toFixed(0)}% of level gold budget`,
      });
    }
    if (row.jackpotValueRatio > row.maxAllowedJackpotRatio) {
      issues.push({
        severity: 'error',
        category: 'loot',
        refId: `${row.zoneId}/${row.enemyType}/L${row.level}`,
        message: `${row.label} L${row.level} jackpot drop value ${row.jackpotVendorValue} exceeds ${(row.maxAllowedJackpotRatio * 100).toFixed(0)}% of level gold budget`,
      });
    }
  }
  return issues;
}

function auditQuestRows(rows: readonly QuestGoldBudgetRow[]): EconomyProgressionIssue[] {
  return rows
    .filter((row) => row.goldRatio > MAX_QUEST_GOLD_RATIO)
    .map((row) => ({
      severity: 'error',
      category: 'quest',
      refId: row.questId,
      message: `${row.questName} L${row.minLevel} gold reward ${row.rewardGold} exceeds ${(MAX_QUEST_GOLD_RATIO * 100).toFixed(0)}% of level gold budget`,
    }));
}

function auditJourneyRows(rows: readonly JourneyEconomyRow[]): EconomyProgressionIssue[] {
  const issues: EconomyProgressionIssue[] = [];
  for (const row of rows) {
    if (row.endingLevel < ECONOMY_BUDGET_MAX_LEVEL) {
      issues.push({
        severity: 'error',
        category: 'journey',
        refId: row.pathId,
        message: `${row.pathId} ends at level ${row.endingLevel}; expected level ${ECONOMY_BUDGET_MAX_LEVEL} within one day`,
      });
    }
    if (row.skippedLevelCount > 0) {
      issues.push({
        severity: 'error',
        category: 'journey',
        refId: row.pathId,
        message: `${row.pathId} skipped ${row.skippedLevelCount} level(s) from single awards`,
      });
    }
    if (row.emptyWindowCount > 0 || row.maxMeaningfulGapHours > MAX_JOURNEY_MEANINGFUL_GAP_HOURS) {
      issues.push({
        severity: 'error',
        category: 'journey',
        refId: row.pathId,
        message: `${row.pathId} has ${row.emptyWindowCount} empty hourly windows and max gap ${row.maxMeaningfulGapHours}h`,
      });
    }
    if (row.obsoleteQuestCount > 0) {
      issues.push({
        severity: 'error',
        category: 'journey',
        refId: row.pathId,
        message: `${row.pathId} leaves ${row.obsoleteQuestCount} obsolete quest(s); deterministic route must clear relevant quests before they age out`,
      });
    }
  }
  return issues;
}

function auditGearRows(rows: readonly JourneyGearCheckpointRow[]): EconomyProgressionIssue[] {
  return rows
    .filter((row) => row.gearScore < MIN_GEAR_SCORE_BY_CHECKPOINT[row.checkpointLevel])
    .map((row) => ({
      severity: 'error',
      category: 'gear',
      refId: `${row.pathId}/L${row.checkpointLevel}`,
      message: `${row.pathId} has gear score ${row.gearScore} at L${row.checkpointLevel}; expected at least ${MIN_GEAR_SCORE_BY_CHECKPOINT[row.checkpointLevel]}`,
    }));
}

function journeyPathId(row: PlayerJourneySummary): string {
  return row.requestedSpecializationId ?? row.chosenSpecializationId ?? row.className;
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

export function bestEquipScoreByLevel(level: number): Partial<Record<EquipSlot, { itemId: ItemId; score: number }>> {
  const best: Partial<Record<EquipSlot, { itemId: ItemId; score: number }>> = {};
  for (const item of Object.values(ITEMS)) {
    if (!item.equip || !item.stats) continue;
    const requiredLevel = Math.max(GRADE_MIN_LEVEL[item.grade ?? 'none'] ?? 1, item.equip.requirements?.minLevel ?? 1);
    if (requiredLevel > level) continue;
    const score = itemScore(item.stats);
    for (const slot of occupiedSlotsForSpec(item.equip)) {
      const current = best[slot];
      if (!current || score > current.score) best[slot] = { itemId: item.id, score };
    }
  }
  return best;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function max(values: readonly number[]): number {
  return values.reduce((highest, value) => (value > highest ? value : highest), 0);
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}
