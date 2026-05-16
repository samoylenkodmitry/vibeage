import { ITEMS, getItemGrade, getItemWeight } from '../../../../packages/content/items';

type ItemTooltipProps = {
  itemId: string;
  clientX: number;
  clientY: number;
};

export function ItemTooltip({ itemId, clientX, clientY }: ItemTooltipProps) {
  const item = ITEMS[itemId];
  if (!item) {
    return null;
  }
  const stats = item.stats ?? {};
  const grade = getItemGrade(item);
  const weight = getItemWeight(item);
  const left = Math.min(Math.max(clientX, 16), window.innerWidth - 220);
  const top = Math.min(Math.max(clientY - 12, 16), window.innerHeight - 180);
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
  return (
    <div
      className="item-tooltip"
      role="tooltip"
      style={{ position: 'fixed', left, top, zIndex: 9999 }}
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
    </div>
  );
}

function formatStat(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
