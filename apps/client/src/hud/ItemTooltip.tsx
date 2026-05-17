import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ITEMS, getItemGrade, getItemWeight } from '../../../../packages/content/items';

type ItemTooltipProps = {
  itemId: string;
  clientX: number;
  clientY: number;
};

export function ItemTooltip({ itemId, clientX, clientY }: ItemTooltipProps) {
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

  if (!item || typeof document === 'undefined') {
    return null;
  }
  const stats = item.stats ?? {};
  const grade = getItemGrade(item);
  const weight = getItemWeight(item);
  const statRows: Array<[string, number]> = [
    ['P.Atk', stats.pAtk ?? 0],
    ['M.Atk', stats.mAtk ?? 0],
    ['P.Def', stats.pDef ?? 0],
    ['M.Def', stats.mDef ?? 0],
    ['HP', stats.hp ?? 0],
    ['MP', stats.mp ?? 0],
    ['Crit', stats.critRate ?? 0],
  ];
  const visibleStats = statRows.filter(([, value]) => value !== 0);
  return createPortal(
    <div
      ref={ref}
      className="item-tooltip"
      role="tooltip"
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 9999 }}
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
          {visibleStats.map(([label, value]) => (
            <li key={label}><span>{label}</span><strong>{formatStat(value)}</strong></li>
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
    </div>,
    document.body,
  );
}

function formatStat(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
