import { Enemy, PlayerState } from '../../packages/sim/entities';
import { LOOT_TABLES } from '../../packages/content/lootTables.js';
import { getSpecializationById, PROFICIENCY_LEVEL } from '../../packages/content/specializations.js';
import { rng } from '../utils/rng';
import { ItemDrop } from '../../packages/protocol/messages.js';

export function generateLoot(enemy: Enemy, killer?: PlayerState | null): ItemDrop[] {
  const table = LOOT_TABLES[enemy.lootTableId!];
  if (!table) return [];
  const drops: ItemDrop[] = [];

  // §45.3 follow-up — killer's spec passive can boost loot rates
  // (Treasure Hunter `Lucky Find`). Clamp the effective chance at
  // 1.0 so a luck-stacked roll can't go beyond guaranteed.
  const chanceMult = killerLootRateMult(killer);

  table.drops.forEach(d => {
    const chance = Math.min(1, d.chance * chanceMult);
    if (rng() < chance) {
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

function killerLootRateMult(killer: PlayerState | null | undefined): number {
  if (!killer?.specializationId) return 1;
  const spec = getSpecializationById(killer.specializationId);
  if (!spec) return 1;
  let mul = spec.specializationPassive.modifiers.lootRateMultiplier ?? 1;
  if (killer.level >= PROFICIENCY_LEVEL) {
    mul *= spec.proficiencyPassive.modifiers.lootRateMultiplier ?? 1;
  }
  return mul;
}
