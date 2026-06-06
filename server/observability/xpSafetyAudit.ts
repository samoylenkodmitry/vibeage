import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { LOG_CATEGORIES, warn } from '../logger.js';
import { getExperienceToNextLevel } from '../players/playerProgression.js';
import { runtimeMetrics } from './runtimeMetrics.js';

const SUSPICIOUS_ENEMY_LEVEL = 80;
const SUSPICIOUS_ENEMY_XP = getExperienceToNextLevel(60);
const SUSPICIOUS_ENEMY_LEVEL_DELTA = 20;

export type XpAwardSourceKind = 'mob' | 'boss' | 'gm' | 'test' | 'other';

export type XpAwardAuditContext = {
  kind?: XpAwardSourceKind;
  enemy?: Pick<Enemy,
    | 'id'
    | 'type'
    | 'name'
    | 'level'
    | 'baseExperienceValue'
    | 'experienceValue'
    | 'isMiniBoss'
    | 'bossId'
  >;
};

export type XpAwardAuditEvent = {
  player: PlayerState;
  sourceInfo: string;
  rawXp: number;
  appliedXp: number;
  levelBefore: number;
  levelAfter: number;
  expBefore: number;
  expAfter: number;
  context?: XpAwardAuditContext;
};

export function recordEnemyExperienceSpawn(
  enemy: Pick<Enemy, 'id' | 'type' | 'name' | 'level' | 'baseExperienceValue' | 'isMiniBoss' | 'bossId'>,
  experienceMultiplier: number,
): void {
  runtimeMetrics.increment('enemy.spawn.total');
  runtimeMetrics.recordHistogram('enemy.spawn.level', enemy.level);
  runtimeMetrics.recordHistogram('enemy.spawn.baseExperienceValue', enemy.baseExperienceValue);
  runtimeMetrics.recordHistogram('enemy.spawn.experienceMultiplier', experienceMultiplier);
  if (enemy.isMiniBoss) {
    runtimeMetrics.increment('enemy.spawn.miniBoss');
  }
  if (enemy.level >= SUSPICIOUS_ENEMY_LEVEL || enemy.baseExperienceValue >= SUSPICIOUS_ENEMY_XP) {
    runtimeMetrics.increment('enemy.spawn.suspicious');
    warn(LOG_CATEGORIES.ENEMY, 'Suspicious enemy XP spawn', {
      enemyId: enemy.id,
      type: enemy.type,
      name: enemy.name,
      level: enemy.level,
      baseExperienceValue: enemy.baseExperienceValue,
      experienceMultiplier,
      isMiniBoss: Boolean(enemy.isMiniBoss),
      bossId: enemy.bossId,
    });
  }
}

export function recordPlayerXpAward(event: XpAwardAuditEvent): void {
  const sourceKind = event.context?.kind ?? inferredSourceKind(event.context?.enemy);
  const capDelta = Math.max(0, event.rawXp - event.appliedXp);
  const levelsGained = Math.max(0, event.levelAfter - event.levelBefore);

  runtimeMetrics.increment('xp.award.total');
  runtimeMetrics.increment(`xp.award.source.${sourceKind}`);
  runtimeMetrics.recordHistogram('xp.award.raw', event.rawXp);
  runtimeMetrics.recordHistogram('xp.award.applied', event.appliedXp);
  runtimeMetrics.recordHistogram('xp.award.levelsGained', levelsGained);

  if (capDelta > 0) {
    runtimeMetrics.increment('xp.award.capped');
    runtimeMetrics.increment(`xp.award.capped.${sourceKind}`);
    runtimeMetrics.recordHistogram('xp.award.capDelta', capDelta);
    warn(LOG_CATEGORIES.PLAYER, 'Capped XP award', xpAwardLogPayload(event, sourceKind, capDelta));
  }

  if (levelsGained > 1) {
    runtimeMetrics.increment('xp.award.levelSkip');
    warn(LOG_CATEGORIES.PLAYER, 'XP award skipped multiple levels', xpAwardLogPayload(event, sourceKind, capDelta));
  }

  const enemy = event.context?.enemy;
  if (!enemy) return;
  const enemyLevelDelta = enemy.level - event.levelBefore;
  runtimeMetrics.recordHistogram('xp.award.enemyLevel', enemy.level);
  runtimeMetrics.recordHistogram('xp.award.enemyLevelDelta', enemyLevelDelta);
  runtimeMetrics.recordHistogram('xp.award.enemyBaseExperienceValue', enemy.baseExperienceValue);
  if (enemyLevelDelta >= SUSPICIOUS_ENEMY_LEVEL_DELTA) {
    runtimeMetrics.increment('xp.award.enemyLevelDelta.suspicious');
    warn(LOG_CATEGORIES.PLAYER, 'Suspicious XP award enemy level delta', xpAwardLogPayload(event, sourceKind, capDelta));
  }
}

function inferredSourceKind(enemy: XpAwardAuditContext['enemy']): XpAwardSourceKind {
  if (!enemy) return 'other';
  return enemy.isMiniBoss ? 'boss' : 'mob';
}

function xpAwardLogPayload(event: XpAwardAuditEvent, sourceKind: XpAwardSourceKind, capDelta: number): Record<string, unknown> {
  const enemy = event.context?.enemy;
  return {
    playerId: event.player.id,
    playerName: event.player.name,
    sourceInfo: event.sourceInfo,
    sourceKind,
    rawXp: event.rawXp,
    appliedXp: event.appliedXp,
    capDelta,
    levelBefore: event.levelBefore,
    levelAfter: event.levelAfter,
    expBefore: event.expBefore,
    expAfter: event.expAfter,
    enemy: enemy
      ? {
          id: enemy.id,
          type: enemy.type,
          name: enemy.name,
          level: enemy.level,
          baseExperienceValue: enemy.baseExperienceValue,
          experienceValue: enemy.experienceValue,
          isMiniBoss: Boolean(enemy.isMiniBoss),
          bossId: enemy.bossId,
        }
      : null,
  };
}
