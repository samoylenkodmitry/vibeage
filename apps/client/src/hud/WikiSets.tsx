import { useEffect, useMemo, useRef } from 'react';
import { EQUIPMENT_SETS, type EquipmentSet, getSetMaxWearable } from '../../../../packages/content/equipmentSets';
import { ITEMS } from '../../../../packages/content/items';
import type { WikiNav } from './WikiBosses';

/**
 * PR W — Wiki Sets tab. Reads EQUIPMENT_SETS directly so any set
 * declared in content (legacy leather_set, the four boss-tier sets
 * in bossGear.ts) appears automatically. Cross-links every member
 * piece back to the Items tab.
 */
export function SetsTab({
  query, focusId, focusKey, navigate,
}: { query: string; focusId: string | null; focusKey: string; navigate: WikiNav }) {
  const rows = useMemo(() => Object.values(EQUIPMENT_SETS).filter((s) =>
    matches(`${s.setId} ${s.name} ${s.requiredPieces.join(' ')}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((set) => (
        <SetLi key={set.setId} set={set} isFocus={set.setId === focusId} focusKey={focusKey} navigate={navigate} />
      ))}
    </ul>
  );
}

function SetLi({
  set, isFocus, focusKey, navigate,
}: { set: EquipmentSet; isFocus: boolean; focusKey: string; navigate: WikiNav }) {
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (isFocus && focusKey && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isFocus, focusKey]);
  const cap = getSetMaxWearable(set);
  // Same source of truth the runtime uses for bonus-tier ceilings
  // and the equipmentSetSlotValidity test uses for cross-content
  // checks. If `cap < requiredPieces.length` the player can never
  // wear the full set — that's a content bug and validation will
  // block it; the wiki shows the cap explicitly so the constraint
  // is visible.
  const capText = cap < set.requiredPieces.length
    ? `${cap} of ${set.requiredPieces.length} pieces wearable`
    : `${set.requiredPieces.length} pieces`;
  return (
    <li ref={ref} className={`wiki-row${isFocus ? ' wiki-row--focus' : ''}`}>
      <header>
        <strong>{set.name}</strong>
        <span className="wiki-row-tag">set · {capText}</span>
      </header>
      <small className="wiki-row-footer">
        Pieces:{' '}
        {set.requiredPieces.map((id, i) => {
          const it = ITEMS[id];
          return (
            <span key={`${id}-${i}`}>
              {i > 0 && ', '}
              <button type="button" className="wiki-effect-chip" onClick={() => navigate('items', id)}>
                {it?.name ?? id}
              </button>
            </span>
          );
        })}
      </small>
      <dl className="wiki-set-bonuses">
        {set.bonuses.map((bonus, i) => (
          <div key={i} className="wiki-set-bonus">
            <dt>{bonus.requiredCount} pieces</dt>
            <dd>{formatStats(bonus.statModifiers)}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function formatStats(stats: EquipmentSet['bonuses'][number]['statModifiers']): string {
  const parts: string[] = [];
  if (stats.pAtk !== undefined) parts.push(`+${stats.pAtk} P.Atk`);
  if (stats.mAtk !== undefined) parts.push(`+${stats.mAtk} M.Atk`);
  if (stats.pDef !== undefined) parts.push(`+${stats.pDef} P.Def`);
  if (stats.mDef !== undefined) parts.push(`+${stats.mDef} M.Def`);
  if (stats.hp !== undefined) parts.push(`+${stats.hp} HP`);
  if (stats.mp !== undefined) parts.push(`+${stats.mp} MP`);
  if (stats.critRate !== undefined) parts.push(`+${stats.critRate} crit`);
  if (stats.attackSpeed !== undefined) parts.push(`+${stats.attackSpeed} atk spd`);
  if (stats.moveSpeed !== undefined) parts.push(`+${stats.moveSpeed} move`);
  return parts.length === 0 ? '—' : parts.join(', ');
}

function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
