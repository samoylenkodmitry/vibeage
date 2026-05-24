import { useMemo } from 'react';
import { vendorSellPriceFor, type VendorDef } from '../../../../packages/content/vendors';
import type { PlayerEntity } from '../gameTypes';
import { ItemCell } from './ItemCell';
import { useDraggablePanel } from './useDraggablePanel';

/**
 * PR GG — Vendor browse panel. Opens when the player clicks Browse
 * on the NpcDialog of a vendor NPC. Reads VENDORS for stock + price
 * and the player's inventory for the sell side. Server is authoritative
 * — every Buy/Sell click is a message; the panel re-renders off the
 * playerUpdated broadcast.
 */
type VendorPanelProps = {
  vendor: VendorDef;
  player: PlayerEntity;
  onClose: () => void;
  onBuy: (vendorId: string, itemId: string, quantity: number) => void;
  onSell: (vendorId: string, itemId: string, quantity: number) => void;
};

export function VendorPanel({ vendor, player, onClose, onBuy, onSell }: VendorPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('vendor');
  const gold = player.gold ?? 0;
  const inventoryRows = useMemo(() => {
    // Aggregate by itemId so an item that spans multiple stacks
    // collapses to a single row (unique React key + cleaner UI).
    const aggregated = new Map<string, number>();
    for (const slot of player.inventory ?? []) {
      if (!slot.itemId || slot.quantity <= 0) continue;
      aggregated.set(slot.itemId, (aggregated.get(slot.itemId) ?? 0) + slot.quantity);
    }
    const rows: { itemId: string; quantity: number; unitPrice: number }[] = [];
    for (const [itemId, quantity] of aggregated.entries()) {
      const unitPrice = vendorSellPriceFor(vendor, itemId);
      if (unitPrice <= 0) continue;
      rows.push({ itemId, quantity, unitPrice });
    }
    return rows;
  }, [player.inventory, vendor]);

  return (
    <section ref={panelRef} className="vendor-panel" aria-label={`Browse ${vendor.name}`}>
      <header className="vendor-panel-header panel-title">
        <div>
          <strong>{vendor.name}</strong>
          <small>{vendor.title}</small>
        </div>
        <div className="vendor-panel-wallet">
          <small>Your gold</small>
          <strong>{gold.toLocaleString()}</strong>
        </div>
        <button type="button" className="panel-close" aria-label="Close" onClick={onClose}>×</button>
      </header>
      <div className="vendor-panel-body">
        <div className="vendor-panel-col">
          <h4>For Sale</h4>
          {vendor.stock.length === 0 && <small>This vendor has nothing for sale.</small>}
          {vendor.stock.map((entry) => {
            const canAfford = gold >= entry.price;
            return (
              <div key={entry.itemId} className="vendor-row">
                <ItemCell itemId={entry.itemId} />
                <span>{entry.price.toLocaleString()}g</span>
                <button
                  type="button"
                  disabled={!canAfford}
                  onClick={() => onBuy(vendor.id, entry.itemId, 1)}
                >Buy</button>
              </div>
            );
          })}
        </div>
        <div className="vendor-panel-col">
          <h4>Buy Back</h4>
          {inventoryRows.length === 0 && <small>You have nothing this vendor wants.</small>}
          {inventoryRows.map((row) => (
            <div key={row.itemId} className="vendor-row">
              <ItemCell itemId={row.itemId} extra={`× ${row.quantity}`} />
              <span>{row.unitPrice.toLocaleString()}g ea.</span>
              <button
                type="button"
                onClick={() => onSell(vendor.id, row.itemId, 1)}
              >Sell 1</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
