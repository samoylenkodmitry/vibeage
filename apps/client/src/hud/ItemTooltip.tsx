import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ItemStatBlock } from '../../../../packages/content/equipmentTypes';
import { ITEMS, getItemGrade, getItemWeight } from '../../../../packages/content/items';
import { getItemSources, type ItemSource } from '../../../../packages/content/obtainability';
import { getMiniBossById } from '../../../../packages/content/miniBosses';
import { ENEMY_TEMPLATES } from '../../../../packages/content/enemies';
import { openWikiAt } from './wikiNavBus';

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
};

export function ItemTooltip({ itemId, clientX, clientY, hoverHandlers, compareStats }: ItemTooltipProps) {
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
  if (!item || typeof document === 'undefined' || !document.body) {
    return null;
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
      <header>
        <strong>{item.name}</strong>
        {grade !== 'none' && <span className="item-tooltip-grade">{grade.toUpperCase()}</span>}
      </header>
      <p>{item.description}</p>
      {item.equip && (
        <small className="item-tooltip-slot">
          {item.equip.bodyPart} · {item.equip.handUsage ?? item.equip.armorType ?? item.equip.weaponType ?? 'jewelry'}
        </small>
      )}
      {visibleStats.length > 0 && (
        <ul>
          {visibleStats.map(([label, value, delta]) => (
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
      )}
      {(weight > 0 || item.healAmount || item.manaAmount) && (
        <footer>
          {item.healAmount ? <span>Heals {item.healAmount} HP</span> : null}
          {item.manaAmount ? <span>Restores {item.manaAmount} MP</span> : null}
          {weight > 0 ? <span>{(weight / 1000).toFixed(1)} kg</span> : null}
        </footer>
      )}
      {sourceLabel && <small className="item-tooltip-source">Source: {sourceLabel}</small>}
      <button
        type="button"
        className="tooltip-wiki-link"
        onClick={(e) => { e.stopPropagation(); openWikiAt('items', item.id); }}
        title="Open in Wiki"
      >Open in Wiki →</button>
    </div>,
    document.body,
  );
}

function formatStat(value: number): string {
  return value > 0 ? `+${value}` : String(value);
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
