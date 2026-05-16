import type { PlayerState } from '../../packages/sim/entities.js';
import { addItemsToPlayer } from './aggregateBridge.js';

/**
 * Starting bag for every fresh character: a basic weapon, shield, three
 * pieces of leather, one ring, and a stack of potions. Gives the new
 * Bag and Paperdoll panels something to show on first spawn so the
 * equipment system is immediately discoverable.
 */
export const STARTER_LOADOUT: ReadonlyArray<{ templateId: string; count: number }> = [
  { templateId: 'worn_sword', count: 1 },
  { templateId: 'wooden_shield', count: 1 },
  { templateId: 'leather_helmet', count: 1 },
  { templateId: 'leather_tunic', count: 1 },
  { templateId: 'leather_pants', count: 1 },
  { templateId: 'bone_ring', count: 1 },
  { templateId: 'health_potion', count: 5 },
];

export function applyStarterLoadout(player: PlayerState): void {
  for (const { templateId, count } of STARTER_LOADOUT) {
    addItemsToPlayer(player, templateId, count);
  }
}
