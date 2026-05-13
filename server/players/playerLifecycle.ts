import type { RespawnRequest } from '../../packages/protocol/messages.js';
import type { PlayerState } from '../../shared/types.js';
import type { GameState } from '../gameState.js';
import { log, LOG_CATEGORIES } from '../logger.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import { emitPlayerUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';
import {
  getMaxHealthForLevel,
  getMaxManaForLevel,
} from './playerProgression.js';

const MANA_REGEN_PER_TICK = 2;
const RESPAWN_POSITION = { x: 0, y: 0.5, z: 0 };

type PlayerUpdatePayload = {
  id: string;
  experience?: number;
  experienceToNextLevel?: number;
  level?: number;
  maxHealth?: number;
  health?: number;
  maxMana?: number;
  mana?: number;
  availableSkillPoints?: number;
  position?: PlayerState['position'];
  isAlive?: boolean;
  deathTimeTs?: number;
};

export function awardPlayerXP(
  player: PlayerState,
  xpAmount: number,
  sourceInfo: string,
): PlayerUpdatePayload {
  const oldExp = player.experience;
  player.experience += xpAmount;
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} gained ${xpAmount} XP from ${sourceInfo}. XP: ${oldExp} -> ${player.experience}`);

  if (player.experience >= player.experienceToNextLevel) {
    const oldLevel = player.level;
    const oldSkillPoints = player.availableSkillPoints;
    const oldMaxExp = player.experienceToNextLevel;

    player.level += 1;
    player.experience -= oldMaxExp;
    player.experienceToNextLevel = Math.floor(oldMaxExp * 1.5);
    player.maxHealth = getMaxHealthForLevel(player.level);
    player.maxMana = getMaxManaForLevel(player.level);
    player.health = player.maxHealth;
    player.mana = player.maxMana;
    player.availableSkillPoints += 1;

    log(LOG_CATEGORIES.PLAYER, `Player ${player.id} leveled up to level ${player.level}! Next level at ${player.experienceToNextLevel} XP`);
    log(LOG_CATEGORIES.PLAYER, `Player ${player.id} gained a skill point. Total: ${player.availableSkillPoints} (before: ${oldSkillPoints})`);
    console.log(`[LEVEL_UP] Player ${player.id}: Level ${oldLevel} -> ${player.level}, Skill Points: ${oldSkillPoints} -> ${player.availableSkillPoints}`);
  }

  return {
    id: player.id,
    experience: player.experience,
    experienceToNextLevel: player.experienceToNextLevel,
    level: player.level,
    maxHealth: player.maxHealth,
    health: player.health,
    maxMana: player.maxMana,
    mana: player.mana,
    availableSkillPoints: player.availableSkillPoints,
  };
}

export function handleManaRegeneration(state: GameState, outbound: OutboundEventSink): void {
  for (const player of Object.values(state.players)) {
    if (!player.isAlive || player.mana >= player.maxMana) {
      continue;
    }

    const oldMana = player.mana;
    player.mana = Math.min(player.maxMana, player.mana + MANA_REGEN_PER_TICK);

    if (Math.abs(player.mana - oldMana) > 0.01) {
      emitPlayerUpdated(outbound, {
        id: player.id,
        mana: player.mana,
      });
    }
  }
}

export function respawnPlayer(
  state: GameState,
  spatial: SpatialHashGrid,
  playerId: string,
): PlayerUpdatePayload | null {
  const player = state.players[playerId];

  if (!player) {
    console.error(`[RespawnRequest] Player ${playerId} not found`);
    return null;
  }

  if (player.isAlive) {
    console.warn(`[RespawnRequest] Player ${playerId} is already alive`);
    return null;
  }

  const oldPosition = { x: player.position.x, z: player.position.z };
  player.isAlive = true;
  player.health = Math.floor(player.maxHealth * 0.5);
  player.mana = Math.floor(player.maxMana * 0.5);
  player.position = { ...RESPAWN_POSITION };
  player.deathTimeTs = undefined;
  player.velocity = { x: 0, z: 0 };

  spatial.remove(player.id, oldPosition);
  spatial.insert(player.id, { x: player.position.x, z: player.position.z });

  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} (${player.name}) respawned at ${JSON.stringify(RESPAWN_POSITION)}`);

  return {
    id: player.id,
    health: player.health,
    mana: player.mana,
    position: player.position,
    isAlive: true,
    deathTimeTs: undefined,
  };
}

export function onRespawnRequest(
  state: GameState,
  msg: RespawnRequest,
  outbound: OutboundEventSink,
  spatial: SpatialHashGrid,
): void {
  const update = respawnPlayer(state, spatial, msg.id);
  if (update) {
    emitPlayerUpdated(outbound, update);
  }
}
