import { type CSSProperties } from 'react';
import { ITEMS } from '../../../../packages/content/items';

/**
 * Skill-bar slot rendered as a bound item (consumable). Click /
 * hotkey fires UseItem on the first bag slot that still holds the
 * itemId. Right-click clears the binding (the action bar is
 * client-only localStorage state — see useActionBar).
 */
export function ItemShortcutButton({
  itemId, hotkey, ariaHotkeys, count, onUse, onClear, compact,
}: {
  itemId: string;
  hotkey: string;
  ariaHotkeys: string;
  /** Aggregate quantity across the whole bag, for the corner badge. */
  count: number;
  /** Use the item — caller resolves "first bag slot with this id". */
  onUse: () => void;
  /** Right-click clears the binding without affecting the bag. */
  onClear: () => void;
  compact?: boolean;
}) {
  const item = ITEMS[itemId];
  const itemName = item?.name ?? itemId;
  const disabled = count === 0;
  return (
    <button
      type="button"
      className={`skill-button skill-button--self-cast skill-button--item${compact ? ' skill-button--compact' : ''}`}
      disabled={disabled}
      aria-label={`Use ${itemName} (${count} in bag)`}
      aria-keyshortcuts={ariaHotkeys}
      style={{ '--cooldown-progress': 0 } as CSSProperties}
      onClick={onUse}
      onContextMenu={(e) => { e.preventDefault(); onClear(); }}
      title={`${itemName} (${count}) — right-click to unbind`}
    >
      <span className="skill-button__hotkey">{hotkey}</span>
      <strong className="skill-button__name">{itemName}</strong>
      <small className="skill-button__footer">{count > 0 ? `x${count}` : '—'}</small>
    </button>
  );
}
