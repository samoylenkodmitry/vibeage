import { Enemy } from '../../shared/types';
import { LOOT_TABLES } from '../lootTables';
import { rng } from '../utils/rng';
import { ItemDrop } from '../../shared/messages';

export function generateLoot(enemy: Enemy): ItemDrop[] {
  const table = LOOT_TABLES[enemy.lootTableId!];
  if (!table) return [];
  const drops: ItemDrop[] = [];

  table.drops.forEach(d => {
    if (rng() < d.chance) {
      const qty =
        d.quantity.min === d.quantity.max
          ? d.quantity.min
          : Math.floor(rng() * (d.quantity.max - d.quantity.min + 1)) +
            d.quantity.min;
      drops.push({ itemId: d.itemId, quantity: qty });
    }
  });

  return drops;
}
