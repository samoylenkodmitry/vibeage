import { QUEST_NPCS } from './npcs.js';

/**
 * Quest-giver / vendor portrait icons. Generated head-and-shoulders busts
 * (256×256) shown next to the NPC name in `NpcDialog` and on each row of
 * the `WikiNpcs` tab. Path convention mirrors classes / races / specs /
 * actions: one PNG per id under `/game/npcs/`, slug = id with `_`→`-`.
 */
export function npcIconSlug(npcId: string): string {
  return npcId.replace(/_/g, '-');
}

export function npcIconPath(npcId: string): string {
  return `/game/npcs/npc-icon-${npcIconSlug(npcId)}.png`;
}

/** Every known NPC id. Useful for audits + bulk wiring. */
export const NPC_IDS = Object.keys(QUEST_NPCS) as readonly string[];
