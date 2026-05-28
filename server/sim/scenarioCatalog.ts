import { CLASS_SKILL_TREES, type CharacterClass } from '../../packages/content/classes.js';
import { BOSS_GEAR_SETS } from '../../packages/content/bossGear.js';
import { ITEMS } from '../../packages/content/items.js';
import { LOOT_TABLES } from '../../packages/content/lootTables.js';
import { QUESTS } from '../../packages/content/quests.js';
import {
  PROFICIENCY_LEVEL,
  SPECIALIZATION_UNLOCK_LEVEL,
  SPECIALIZATIONS,
} from '../../packages/content/specializations.js';
import { createSimulatedEnemy } from './gameSimulator.js';
import { createClassAiPolicy, createSimProfilePlayer, type SimPolicyProfile } from './playerPolicies.js';
import { createGameSimulator, type SimulationSummary } from './gameSimulator.js';

export const SIM_LEVEL_CHECKPOINTS = [1, 5, 10, 20, 40] as const;
export const SIM_PVP_LEVEL = SPECIALIZATION_UNLOCK_LEVEL;

export type PveScenarioDefinition = SimPolicyProfile & {
  id: string;
  level: number;
  enemyType: string;
  enemyLevel: number;
};

export type PvpScenarioDefinition = {
  id: string;
  level: number;
  red: SimPolicyProfile;
  blue: SimPolicyProfile;
};

export type ScenarioRunResult = {
  id: string;
  summary: SimulationSummary;
  durationMs: number;
  timedOut: boolean;
};

export type QuestRewardMilestone = {
  level: number;
  questCount: number;
  totalXp: number;
  totalGold: number;
  rewardItems: string[];
};

export type GearSetMilestone = {
  setId: string;
  name: string;
  grade: string;
  pieces: string[];
  pieceNames: string[];
};

const ALL_CLASSES = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];

export function pveClassScenarios(): PveScenarioDefinition[] {
  return ALL_CLASSES.flatMap((className) => (
    SIM_LEVEL_CHECKPOINTS.map((level) => ({
      id: `pve-${className}-l${level}-goblin`,
      className,
      level,
      enemyType: 'goblin',
      enemyLevel: level,
    }))
  ));
}

export function pveSpecializationScenarios(): PveScenarioDefinition[] {
  return Object.values(SPECIALIZATIONS).flatMap((spec) => (
    [SPECIALIZATION_UNLOCK_LEVEL, PROFICIENCY_LEVEL].map((level) => ({
      id: `pve-${spec.id}-l${level}-goblin`,
      className: spec.baseClass,
      specializationId: spec.id,
      level,
      enemyType: 'goblin',
      enemyLevel: level,
    }))
  ));
}

export function pvpClassScenarios(level = SIM_PVP_LEVEL): PvpScenarioDefinition[] {
  return ALL_CLASSES.flatMap((red) => (
    ALL_CLASSES.map((blue) => ({
      id: `pvp-${red}-vs-${blue}-l${level}`,
      level,
      red: { className: red },
      blue: { className: blue },
    }))
  ));
}

export function runPveScenario(def: PveScenarioDefinition, timeoutMs = 90_000): ScenarioRunResult {
  const sim = createGameSimulator();
  const player = createSimProfilePlayer({
    id: `${def.id}-player`,
    className: def.className,
    specializationId: def.specializationId,
    level: def.level,
    position: { x: 0, z: 0 },
  });
  const enemy = createSimulatedEnemy(def.enemyType, def.enemyLevel, {
    id: `${def.id}-enemy`,
    position: { x: 10, z: 0 },
  });
  sim.addPlayer(player, { policy: createClassAiPolicy(def.className, def.specializationId) });
  sim.addEnemy(enemy);
  const result = sim.runUntil((s) => s.isCombatResolved(), { timeoutMs });
  return { id: def.id, summary: result.summary, durationMs: result.durationMs, timedOut: result.reason === 'timeout' };
}

export function runPvpScenario(def: PvpScenarioDefinition, timeoutMs = 90_000): ScenarioRunResult {
  const sim = createGameSimulator();
  const red = createSimProfilePlayer({
    id: `${def.id}-red`,
    ...def.red,
    level: def.level,
    position: { x: 0, z: 0 },
  });
  const blue = createSimProfilePlayer({
    id: `${def.id}-blue`,
    ...def.blue,
    level: def.level,
    position: { x: 10, z: 0 },
  });
  sim.addPlayer(red, { teamId: 'red', policy: createClassAiPolicy(def.red.className, def.red.specializationId) });
  sim.addPlayer(blue, { teamId: 'blue', policy: createClassAiPolicy(def.blue.className, def.blue.specializationId) });
  const result = sim.runUntil((s) => s.isCombatResolved(), { timeoutMs });
  return { id: def.id, summary: result.summary, durationMs: result.durationMs, timedOut: result.reason === 'timeout' };
}

export function questRewardMilestones(levels: readonly number[] = SIM_LEVEL_CHECKPOINTS): QuestRewardMilestone[] {
  return levels.map((level) => {
    const quests = Object.values(QUESTS).filter((quest) => quest.minLevel <= level);
    return {
      level,
      questCount: quests.length,
      totalXp: sum(quests.map((quest) => quest.reward.xp ?? 0)),
      totalGold: sum(quests.map((quest) => quest.reward.gold ?? 0)),
      rewardItems: [...new Set(quests.flatMap((quest) => quest.reward.items?.map((item) => item.itemId) ?? []))],
    };
  });
}

export function gearSetMilestones(): GearSetMilestone[] {
  return Object.values(BOSS_GEAR_SETS).map((set) => {
    const pieces = [...set.requiredPieces];
    const grades = [...new Set(pieces.map((id) => ITEMS[id]?.grade ?? 'none'))];
    return {
      setId: set.setId,
      name: set.name,
      grade: grades.join('/'),
      pieces,
      pieceNames: pieces.map((id) => ITEMS[id]?.name ?? id),
    };
  });
}

export function expectedGoldForLootTable(tableId: string): number {
  const table = LOOT_TABLES[tableId];
  if (!table) return 0;
  return table.drops
    .filter((drop) => drop.itemId === 'gold_coin')
    .reduce((total, drop) => total + drop.chance * ((drop.quantity.min + drop.quantity.max) / 2), 0);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
