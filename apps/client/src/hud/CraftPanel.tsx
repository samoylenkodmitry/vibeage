import { ITEMS } from '../../../../packages/content/items';
import type { InventorySlot } from '../../../../packages/protocol/messages';
import { useDraggablePanel } from './useDraggablePanel';
import { openWikiAt } from './wikiNavBus';

type CraftPanelProps = {
  recipeSlotIndex: number;
  inventory: InventorySlot[];
  onCraft: (slotIndex: number) => void;
  onClose: () => void;
};

/**
 * PR AA — recipe craft panel. Opens when the player taps a recipe
 * in the bag. Renders the recipe spec straight from ITEMS (single
 * source of truth) with one row per ingredient showing have /
 * required counts, plus the output. Every chip opens the matching
 * Wiki entry; the Craft button is gated by whether all inputs are
 * present in sufficient quantity.
 */
export function CraftPanel({ recipeSlotIndex, inventory, onCraft, onClose }: CraftPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('craft');
  const slot = inventory[recipeSlotIndex];
  const recipeItem = slot ? ITEMS[slot.itemId] : null;
  if (!recipeItem?.recipe) return null;
  const spec = recipeItem.recipe;

  const haveByItem = new Map<string, number>();
  for (const s of inventory) {
    if (!s || s.quantity <= 0) continue;
    haveByItem.set(s.itemId, (haveByItem.get(s.itemId) ?? 0) + s.quantity);
  }
  const ingredients = spec.inputs.map((inp) => {
    const have = haveByItem.get(inp.itemId) ?? 0;
    const item = ITEMS[inp.itemId];
    return { itemId: inp.itemId, name: item?.name ?? inp.itemId, required: inp.quantity, have };
  });
  const canCraft = ingredients.every((row) => row.have >= row.required);
  const outputItem = ITEMS[spec.output.itemId];

  return (
    <section ref={panelRef} className="hud craft-panel" aria-label="Craft">
      <div className="panel-title">
        <button
          type="button"
          className="panel-title-link"
          onClick={() => openWikiAt('recipes', recipeItem.id)}
          title="Open recipe in Wiki"
        >
          <strong>{recipeItem.name}</strong>
        </button>
        <button type="button" className="panel-close" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <p className="craft-panel-desc">{recipeItem.description}</p>
      <ul className="craft-panel-ingredients">
        {ingredients.map((row) => (
          <li key={row.itemId} className={`craft-row${row.have >= row.required ? ' craft-row--ok' : ' craft-row--short'}`}>
            <button
              type="button"
              className="wiki-effect-chip"
              onClick={() => openWikiAt('items', row.itemId)}
              title="Open in Wiki"
            >{row.name}</button>
            <span className="craft-row-counts">
              <strong>{row.have}</strong> / {row.required}
            </span>
          </li>
        ))}
      </ul>
      <div className="craft-panel-output">
        <span>Produces:</span>
        <button
          type="button"
          className="wiki-effect-chip"
          onClick={() => openWikiAt('items', spec.output.itemId)}
          title="Open in Wiki"
        >{(outputItem?.name ?? spec.output.itemId)} ×{spec.output.quantity}</button>
      </div>
      <button
        type="button"
        className="craft-panel-button"
        disabled={!canCraft}
        onClick={() => { onCraft(recipeSlotIndex); onClose(); }}
        title={canCraft ? 'Craft (consumes inputs + recipe)' : 'Missing ingredients'}
      >
        {canCraft ? 'Craft' : 'Need ingredients'}
      </button>
    </section>
  );
}
