import { LOOT_TABLES } from '../../../../packages/content/lootTables';
import type { WikiNav } from './WikiBosses';

/**
 * PR T — shared "Drops" footer that resolves a loot-table id to its
 * drops + renders item chips. Reused by MobsTab (WikiPanel) and
 * BossesTab (WikiBosses) so the per-mob and per-boss drop views stay
 * in sync with what actually drops at runtime — both read straight
 * from LOOT_TABLES, the same record the server resolves drops from.
 */
export function LootDropsForTable({ tableId, navigate }: { tableId: string; navigate: WikiNav }) {
  const table = LOOT_TABLES[tableId];
  if (!table || table.drops.length === 0) return null;
  return (
    <small className="wiki-row-footer">
      Drops:{' '}
      {table.drops.map((drop, i) => {
        const pct = Math.round(drop.chance * 100);
        const qty = drop.quantity.min === drop.quantity.max
          ? `${drop.quantity.min}`
          : `${drop.quantity.min}-${drop.quantity.max}`;
        return (
          <span key={`${drop.itemId}-${i}`}>
            {i > 0 && ', '}
            <button type="button" className="wiki-effect-chip" onClick={() => navigate('items', drop.itemId)}>
              {drop.itemId} ({pct}% · {qty})
            </button>
          </span>
        );
      })}
    </small>
  );
}
