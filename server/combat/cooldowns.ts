import type { SkillDef, SkillId } from '../../packages/content/skills.js';
import type { PlayerState } from '../../packages/sim/entities.js';

export type PlayerResourceUpdate = {
  mana: number;
  skillCooldownEndTs: Record<string, number>;
};

export function getSkillCooldownEnd(player: PlayerState, skillId: SkillId): number {
  return player.skillCooldownEndTs?.[skillId] ?? 0;
}

export function isSkillOnCooldown(player: PlayerState, skillId: SkillId, now: number): boolean {
  return now < getSkillCooldownEnd(player, skillId);
}

export function hasEnoughMana(player: PlayerState, skill: Pick<SkillDef, 'manaCost'>): boolean {
  return player.mana >= (skill.manaCost ?? 0);
}

export function applySkillCostAndCooldown(
  player: PlayerState,
  skillId: SkillId,
  skill: Pick<SkillDef, 'manaCost' | 'cooldownMs'>,
  now: number,
): PlayerResourceUpdate {
  player.mana = Math.max(0, player.mana - (skill.manaCost ?? 0));
  player.skillCooldownEndTs = {
    ...(player.skillCooldownEndTs ?? {}),
    [skillId]: now + (skill.cooldownMs ?? 0),
  };

  return buildPlayerResourceUpdate(player);
}

export function buildPlayerResourceUpdate(player: PlayerState): PlayerResourceUpdate {
  return {
    mana: player.mana,
    skillCooldownEndTs: player.skillCooldownEndTs,
  };
}
