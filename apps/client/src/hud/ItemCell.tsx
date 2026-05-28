import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { ITEMS } from '../../../../packages/content/items';
import { getGradeSpec, type ItemGrade } from '../../../../packages/content/equipmentTypes';
import { ItemTooltip } from './ItemTooltip';
import { useTooltipTrigger } from './useTooltipTrigger';
import { openWikiAt } from './wikiNavBus';

/**
 * Reusable item display chip. Renders the item name (and any
 * caller-supplied extras like price or quantity) as a clickable
 * pill that:
 *  - opens the same `ItemTooltip` everywhere on hover / long-press,
 *  - opens it in STICKY mode on click so the Wiki link + stats stay
 *    reachable on touch, and
 *  - right-clicks straight to the Wiki Items tab for power users.
 *
 * Wherever the game lists items (vendor browse, paperdoll, future
 * mailbox / trade window / quest reward preview / boss loot popup),
 * one `<ItemCell>` keeps the affordances identical. The look-and-
 * feel and the wiki-link path are owned in one place.
 */
export function ItemCell({
  itemId, label, extra, className, onClickAction,
}: {
  itemId: string;
  /** Override for the displayed text. Defaults to the item's name. */
  label?: string;
  /** Extra content rendered after the label (e.g. \" × 3\", price). */
  extra?: ReactNode;
  /** Optional class for layout / spacing tweaks. */
  className?: string;
  /** Optional primary action (Buy / Sell / Use). When present, the
   *  click handler fires the action AND opens the tooltip on a
   *  *separate* button gesture (the icon area). Without it click
   *  opens the tooltip. */
  onClickAction?: (event: ReactMouseEvent) => void;
}) {
  const item = ITEMS[itemId];
  const tooltip = useTooltipTrigger<string>();
  const [stickyOpen, setStickyOpen] = useState(false);

  const grade = (item?.grade ?? 'none') as ItemGrade;
  const spec = getGradeSpec(grade);
  const triggerProps = tooltip.triggerProps(itemId);

  const onClick = (event: ReactMouseEvent) => {
    if (onClickAction) {
      // Caller has its own primary action — keep that path; the
      // tooltip is reachable through hover / long-press on the name.
      onClickAction(event);
      return;
    }
    event.stopPropagation();
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setStickyOpen(true);
    tooltip.openSticky(itemId, event.clientX, event.clientY, {
      top: r.top, bottom: r.bottom, left: r.left, right: r.right,
    });
  };

  return (
    <>
      <button
        type="button"
        className={`item-cell${className ? ` ${className}` : ''}`}
        title={item?.description ?? itemId}
        onClick={onClick}
        onContextMenu={(e) => { e.preventDefault(); openWikiAt('items', itemId); }}
        {...triggerProps}
      >
        {item?.icon && <img className="item-cell-icon" src={item.icon} alt="" aria-hidden="true" />}
        <span className="item-cell-name">{label ?? item?.name ?? itemId}</span>
        {grade !== 'none' && (
          <span
            className="item-cell-grade"
            style={{ color: spec.color, borderColor: spec.color }}
            aria-label={`Grade ${spec.label}`}
          >{spec.label}</span>
        )}
        {extra && <span className="item-cell-extra">{extra}</span>}
      </button>
      {tooltip.info && (
        <ItemTooltip
          itemId={tooltip.info.payload}
          clientX={tooltip.info.clientX}
          clientY={tooltip.info.clientY}
          anchorRect={tooltip.info.anchorRect}
          hoverHandlers={tooltip.hoverHandlers}
          sticky={tooltip.info.sticky || stickyOpen}
        />
      )}
    </>
  );
}
