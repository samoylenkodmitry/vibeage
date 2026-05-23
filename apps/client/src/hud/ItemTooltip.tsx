import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ItemStatBlock } from '../../../../packages/content/equipmentTypes';
import { getEffectiveMinLevel } from '../../../../packages/content/equipmentTypes';
import { ITEMS, getItemGrade, getItemWeight } from '../../../../packages/content/items';
import { getItemSources, type ItemSource } from '../../../../packages/content/obtainability';
import { recipesUsingMaterial } from '../../../../packages/content/recipeLookups';
import { getMiniBossById } from '../../../../packages/content/miniBosses';
import { ENEMY_TEMPLATES } from '../../../../packages/content/enemies';
import { openWikiAt } from './wikiNavBus';

/**
 * Bag-slot action callbacks. When the tooltip is shown for an item
 * in the player's bag, the tooltip renders Use / Equip / Drop /
 * Destroy buttons next to the Wiki link so the player has a
 * gesture-independent path to every action. Empty / paperdoll /
 * wiki contexts pass `bagActions: undefined` and the buttons are
 * hidden.
 */
export type BagTooltipActions = {
  slotIndex: number;
  canUse: boolean;
  canEquip: boolean;
  canOpenRecipe: boolean;
  onUse: (slotIndex: number) => void;
  onEquip: (slotIndex: number) => void;
  onOpenRecipe: (slotIndex: number) => void;
  onDrop: (slotIndex: number) => void;
  onDestroy: (slotIndex: number) => void;
  /** Called after any action button fires so the tooltip dismisses
   *  immediately and the player isn't left looking at stale UI. */
  onClose: () => void;
};

type ItemTooltipProps = {
  itemId: string;
  clientX: number;
  clientY: number;
  /**
   * PR JJ — pointer-enter/leave handlers from the parent's
   * useTooltipTrigger.hoverHandlers. Keeps the tooltip alive while
   * the cursor sits inside it so the wiki link is clickable.
   */
  hoverHandlers?: {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
  };
  /**
   * §49/M2 — stats of the currently-equipped item in the same slot
   * as the hovered item, if any. When present, the tooltip appends
   * a green/red delta after each stat row so the player can compare
   * "before / after" without doing arithmetic in their head.
   */
  compareStats?: ItemStatBlock;
  /** Bag-action buttons — see BagTooltipActions doc. */
  bagActions?: BagTooltipActions;
  /** When true (click-to-open tooltips), render an explicit ×
   *  close control so the user has a visible way to dismiss. The
   *  hover-opened path doesn't need this — pointer-leave + outside-
   *  click both close it for free. */
  sticky?: boolean;
};

export function ItemTooltip({ itemId, clientX, clientY, hoverHandlers, compareStats, bagActions, sticky }: ItemTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>(() => ({
    left: Math.max(8, clientX),
    top: Math.max(8, clientY - 12),
  }));
  const item = ITEMS[itemId];

  // Measure the tooltip after mount and clamp it inside the viewport for real.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(
      Math.max(margin, clientX),
      Math.max(margin, window.innerWidth - rect.width - margin),
    );
    const top = Math.min(
      Math.max(margin, clientY - rect.height - 12),
      Math.max(margin, window.innerHeight - rect.height - margin),
    );
    setPos({ left, top });
  }, [clientX, clientY, itemId]);

  // §49/M8 + M14 — single-line "Source:" hint so the player can
  // tell where to look for more of this item without opening the
  // wiki. Memoized — `getItemSources` walks loot tables.
  const sourceLabel = useMemo(() => item ? formatPrimarySource(getItemSources(item.id)) : null, [item]);
  // §49/M2 — companion "Used in:" line. Closes the trophy → recipe
  // loop: when the player hovers a Warband Horn they see both
  // "Source: Dropped by Grakk" AND "Used in: Chieftain's Cleaver".
  // Lists up to two output names so the line fits.
  const usesLabel = useMemo(() => item ? formatRecipeUses(item.id) : null, [item]);
  if (typeof document === 'undefined' || !document.body) return null;
  if (!item) {
    return createPortal(
      <OrphanItemTooltip itemId={itemId} pos={pos} containerRef={ref} hoverHandlers={hoverHandlers} bagActions={bagActions} />,
      document.body,
    );
  }
  const stats = item.stats ?? {};
  const grade = getItemGrade(item);
  const weight = getItemWeight(item);
  // §49/M2 — keep the row shape ([label, value, deltaVsEquipped])
  // so the same statRows array drives both display + delta render.
  const statRows: Array<[string, number, number | null]> = [
    ['P.Atk', stats.pAtk ?? 0, computeDelta('pAtk', stats, compareStats)],
    ['M.Atk', stats.mAtk ?? 0, computeDelta('mAtk', stats, compareStats)],
    ['P.Def', stats.pDef ?? 0, computeDelta('pDef', stats, compareStats)],
    ['M.Def', stats.mDef ?? 0, computeDelta('mDef', stats, compareStats)],
    ['HP', stats.hp ?? 0, computeDelta('hp', stats, compareStats)],
    ['MP', stats.mp ?? 0, computeDelta('mp', stats, compareStats)],
    ['Crit', stats.critRate ?? 0, computeDelta('critRate', stats, compareStats)],
  ];
  // Show a row if EITHER the hovered item has the stat OR the
  // currently-equipped item does (so the delta is visible when
  // hovering a downgrade that loses a stat).
  const visibleStats = statRows.filter(([, value, delta]) => value !== 0 || (delta !== null && delta !== 0));
  return createPortal(
    <div
      ref={ref}
      className="item-tooltip"
      role="tooltip"
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999 }}
      onPointerEnter={hoverHandlers?.onPointerEnter}
      onPointerLeave={hoverHandlers?.onPointerLeave}
    >
      <TooltipHeader name={item.name} grade={grade} onClose={sticky && bagActions ? bagActions.onClose : undefined} />
      <p>{item.description}</p>
      {item.equip && (
        <small className="item-tooltip-slot">
          {item.equip.bodyPart} · {item.equip.handUsage ?? item.equip.armorType ?? item.equip.weaponType ?? 'jewelry'}
        </small>
      )}
      {item.equip && <EquipRequirementsLine equip={item.equip} grade={grade} />}
      <StatRowList rows={visibleStats} />
      {(weight > 0 || item.healAmount || item.manaAmount) && (
        <footer>
          {item.healAmount ? <span>Heals {item.healAmount} HP</span> : null}
          {item.manaAmount ? <span>Restores {item.manaAmount} MP</span> : null}
          {weight > 0 ? <span>{(weight / 1000).toFixed(1)} kg</span> : null}
        </footer>
      )}
      {sourceLabel && <small className="item-tooltip-source">Source: {sourceLabel}</small>}
      {usesLabel && <small className="item-tooltip-source">Used in: {usesLabel}</small>}
      {bagActions ? (
        <BagActionRow itemId={item.id} actions={bagActions} />
      ) : (
        <button
          type="button"
          className="tooltip-wiki-link"
          onClick={(e) => { e.stopPropagation(); openWikiAt('items', item.id); }}
          title="Open in Wiki"
        >Open in Wiki →</button>
      )}
    </div>,
    document.body,
  );
}

function OrphanItemTooltip({
  itemId, pos, containerRef, hoverHandlers, bagActions,
}: {
  itemId: string;
  pos: { left: number; top: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  hoverHandlers?: { onPointerEnter: () => void; onPointerLeave: () => void };
  bagActions?: BagTooltipActions;
}) {
  return (
    <div
      ref={containerRef}
      className="item-tooltip"
      role="tooltip"
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999 }}
      onPointerEnter={hoverHandlers?.onPointerEnter}
      onPointerLeave={hoverHandlers?.onPointerLeave}
    >
      <TooltipHeader name={itemId} grade="none" onClose={bagActions?.onClose} />
      <p>This item was retired from the game in a content update. You can destroy it to free the slot.</p>
      {bagActions && (
        <div className="item-tooltip-actions">
          <button
            type="button"
            className="item-tooltip-action item-tooltip-action--destroy"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              bagActions.onDestroy(bagActions.slotIndex);
              bagActions.onClose();
            }}
          >
            Destroy
          </button>
        </div>
      )}
    </div>
  );
}

function TooltipHeader({
  name, grade, onClose,
}: {
  name: string;
  grade: ReturnType<typeof getItemGrade>;
  onClose?: () => void;
}) {
  return (
    <header>
      <strong>{name}</strong>
      {grade !== 'none' && <span className="item-tooltip-grade">{grade.toUpperCase()}</span>}
      {onClose && (
        <button
          type="button"
          className="item-tooltip-close"
          aria-label="Close tooltip"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >×</button>
      )}
    </header>
  );
}

function EquipRequirementsLine({
  equip,
  grade,
}: {
  equip: NonNullable<import('../../../../packages/content/items').Item['equip']>;
  grade: ReturnType<typeof getItemGrade>;
}) {
  const minLevel = getEffectiveMinLevel(grade, equip.requirements?.minLevel);
  const classes = equip.requirements?.classes;
  return (
    <small className="item-tooltip-requires">
      Requires: <strong>Lv {minLevel}</strong>
      {classes && classes.length > 0
        ? <>{' · '}<strong>{classes.join(' / ')}</strong></>
        : null}
    </small>
  );
}

function BagActionRow({ itemId, actions }: { itemId: string; actions: BagTooltipActions }) {
  const fire = (cb: (slotIndex: number) => void) => (event: ReactMouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    cb(actions.slotIndex);
    actions.onClose();
  };
  return (
    <div className="item-tooltip-actions">
      {actions.canUse && (
        <button type="button" className="item-tooltip-action" onClick={fire(actions.onUse)}>
          Use
        </button>
      )}
      {actions.canEquip && (
        <button type="button" className="item-tooltip-action" onClick={fire(actions.onEquip)}>
          Equip
        </button>
      )}
      {actions.canOpenRecipe && (
        <button type="button" className="item-tooltip-action" onClick={fire(actions.onOpenRecipe)}>
          Open recipe
        </button>
      )}
      <button type="button" className="item-tooltip-action" onClick={fire(actions.onDrop)}>
        Drop on ground
      </button>
      <button
        type="button"
        className="item-tooltip-action item-tooltip-action--destroy"
        onClick={fire(actions.onDestroy)}
      >
        Destroy
      </button>
      <button
        type="button"
        className="tooltip-wiki-link"
        onClick={(e) => { e.stopPropagation(); openWikiAt('items', itemId); }}
      >
        Open in Wiki →
      </button>
    </div>
  );
}

function formatStat(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function StatRowList({ rows }: { rows: Array<[string, number, number | null]> }) {
  if (rows.length === 0) return null;
  return (
    <ul>
      {rows.map(([label, value, delta]) => (
        <li key={label}>
          <span>{label}</span>
          <strong>{formatStat(value)}</strong>
          {delta !== null && delta !== 0 && (
            <span className={`item-tooltip-delta item-tooltip-delta--${delta > 0 ? 'up' : 'down'}`}>
              ({delta > 0 ? '+' : ''}{delta})
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// §49/M2 — exported for tests. Returns null when there's nothing to
// compare against (e.g. no item equipped in the same slot); otherwise
// the signed delta `hovered - equipped`.
export function computeDelta<K extends keyof ItemStatBlock>(
  key: K,
  hovered: ItemStatBlock,
  equipped: ItemStatBlock | undefined,
): number | null {
  if (!equipped) return null;
  return (hovered[key] ?? 0) - (equipped[key] ?? 0);
}

/**
 * §49/M2 — render the output items that consume the hovered item
 * as a recipe input. Returns a comma-joined list of up to 2 output
 * names (with "and N more" suffix when truncated). Skips recipes
 * where the hovered item IS the recipe itself (we already say
 * "Source: …" in that case). Null when nothing uses this item.
 */
export function formatRecipeUses(itemId: string): string | null {
  const item = ITEMS[itemId];
  // The recipe item itself doesn't need a "Used in" line — its
  // output IS the use, and we list inputs in the wiki / craft panel.
  if (!item || item.type === 'recipe') return null;
  const recipes = recipesUsingMaterial(itemId);
  if (recipes.length === 0) return null;
  const outputs = recipes.map((r) => ITEMS[r.recipe!.output.itemId]?.name ?? r.recipe!.output.itemId);
  const head = outputs.slice(0, 2).join(', ');
  if (outputs.length <= 2) return head;
  return `${head}, +${outputs.length - 2} more`;
}

// §49/M8 + M14 — pick a single primary source from the obtainability
// index. Order: vendor (most obvious to a starter) → recipe →
// boss/mob loot → quest reward. Boss/mob loot resolves to a
// display name (boss > mob) so the player can recognize who drops it.
// `null` when there's no source (e.g. a whitelisted future-content
// placeholder).
export function formatPrimarySource(sources: ItemSource[]): string | null {
  const vendor = sources.find((s) => s.kind === 'vendor');
  if (vendor) return `Sold by ${vendor.vendorName}`;
  const recipe = sources.find((s) => s.kind === 'recipe');
  if (recipe) {
    const recipeItem = ITEMS[recipe.recipeItemId];
    return `Crafted from ${recipeItem?.name ?? recipe.recipeItemId}`;
  }
  const loot = sources.find((s) => s.kind === 'loot');
  if (loot) {
    if (loot.bossId) {
      const boss = getMiniBossById(loot.bossId);
      if (boss) return `Dropped by ${boss.name}`;
    }
    if (loot.enemyType) {
      const mob = ENEMY_TEMPLATES[loot.enemyType];
      if (mob) return `Dropped by ${mob.displayName}`;
    }
    return 'Dropped by enemies';
  }
  const quest = sources.find((s) => s.kind === 'quest');
  if (quest) return `Quest reward: ${quest.questName}`;
  return null;
}
