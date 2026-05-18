import { useEffect, useMemo, useRef } from 'react';
import { EQUIPMENT_SETS } from '../../../../packages/content/equipmentSets';
import { ITEMS, type Item } from '../../../../packages/content/items';
import { getLootSourcesForItem, resolveLootTableOwner } from '../../../../packages/content/lootSources';
import type { WikiNav } from './WikiBosses';
import { recipesProducing, recipesUsingMaterial } from './WikiRecipes';

/**
 * PR T+U — Wiki Items tab. Cross-links every item to its drop
 * sources (mobs / bosses) and its recipes (used-in / crafted-from).
 * Reads `ITEMS` directly so adding a new item or recipe in content
 * lights up here automatically; no manual registration anywhere.
 */
export function ItemsTab({
  query, focusId, focusKey, navigate,
}: { query: string; focusId: string | null; focusKey: string; navigate: WikiNav }) {
  const rows = useMemo(() => Object.values(ITEMS).filter((i) =>
    matches(`${i.name} ${i.description} ${i.type ?? ''} ${i.kind ?? ''}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((item) => (
        <ItemLi key={item.id} item={item} isFocus={item.id === focusId} focusKey={focusKey} navigate={navigate} />
      ))}
    </ul>
  );
}

function ItemLi({
  item, isFocus, focusKey, navigate,
}: { item: Item; isFocus: boolean; focusKey: string; navigate: WikiNav }) {
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (isFocus && focusKey && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isFocus, focusKey]);
  const stats = item.stats ?? {};
  return (
    <li ref={ref} className={`wiki-row${isFocus ? ' wiki-row--focus' : ''}`}>
      <header>
        <strong>{item.name}</strong>
        <span className="wiki-row-tag">{item.kind ?? item.type}</span>
      </header>
      <p>{item.description}</p>
      <dl>
        {stats.pAtk !== undefined && <Pair k="P.Atk" v={`+${stats.pAtk}`} />}
        {stats.mAtk !== undefined && <Pair k="M.Atk" v={`+${stats.mAtk}`} />}
        {stats.pDef !== undefined && <Pair k="P.Def" v={`+${stats.pDef}`} />}
        {stats.mDef !== undefined && <Pair k="M.Def" v={`+${stats.mDef}`} />}
        {stats.hp !== undefined && <Pair k="HP" v={`+${stats.hp}`} />}
        {stats.mp !== undefined && <Pair k="MP" v={`+${stats.mp}`} />}
        {item.attackPower !== undefined && <Pair k="Atk Pwr" v={`+${item.attackPower}`} />}
        {item.defenseValue !== undefined && item.defenseValue > 0 && <Pair k="Def Val" v={`+${item.defenseValue}`} />}
        {item.equip && <Pair k="Slot" v={(item.equip.allowedSlots ?? []).join(', ')} />}
        {item.equip?.handUsage && <Pair k="Hands" v={item.equip.handUsage} />}
        {item.weight && <Pair k="Weight" v={`${(item.weight / 1000).toFixed(1)} kg`} />}
        {item.healAmount && <Pair k="Heals" v={`${item.healAmount} HP`} />}
        {item.manaAmount && <Pair k="Restores" v={`${item.manaAmount} MP`} />}
        {item.setId && <Pair k="Set" v={EQUIPMENT_SETS[item.setId]?.name ?? item.setId} />}
        {item.grade && item.grade !== 'none' && <Pair k="Grade" v={item.grade.toUpperCase()} />}
      </dl>
      <ItemDropSources itemId={item.id} navigate={navigate} />
      <ItemRecipeLinks itemId={item.id} navigate={navigate} />
      {item.setId && EQUIPMENT_SETS[item.setId] && (
        <small className="wiki-row-footer">
          Part of:{' '}
          <button type="button" className="wiki-effect-chip" onClick={() => navigate('sets', item.setId!)}>
            {EQUIPMENT_SETS[item.setId].name}
          </button>
        </small>
      )}
    </li>
  );
}

function ItemRecipeLinks({ itemId, navigate }: { itemId: string; navigate: WikiNav }) {
  const usedIn = recipesUsingMaterial(itemId);
  const craftedBy = recipesProducing(itemId);
  if (usedIn.length === 0 && craftedBy.length === 0) return null;
  return (
    <>
      {craftedBy.length > 0 && (
        <small className="wiki-row-footer">
          Crafted from:{' '}
          {craftedBy.map((r, i) => (
            <span key={`${r.id}-${i}`}>
              {i > 0 && ', '}
              <button type="button" className="wiki-effect-chip" onClick={() => navigate('recipes', r.id)}>{r.name}</button>
            </span>
          ))}
        </small>
      )}
      {usedIn.length > 0 && (
        <small className="wiki-row-footer">
          Used in:{' '}
          {usedIn.map((r, i) => (
            <span key={`${r.id}-${i}`}>
              {i > 0 && ', '}
              <button type="button" className="wiki-effect-chip" onClick={() => navigate('recipes', r.id)}>{r.name}</button>
            </span>
          ))}
        </small>
      )}
    </>
  );
}

function ItemDropSources({ itemId, navigate }: { itemId: string; navigate: WikiNav }) {
  const sources = getLootSourcesForItem(itemId);
  if (sources.length === 0) return null;
  return (
    <small className="wiki-row-footer">
      Dropped by:{' '}
      {sources.map((s, i) => {
        const owner = resolveLootTableOwner(s.tableId);
        const label = owner?.kind === 'boss'
          ? owner.spec.name
          : owner?.kind === 'mob'
            ? owner.template.displayName
            : s.tableId;
        const onClick = owner?.kind === 'boss'
          ? () => navigate('bosses', owner.spec.id)
          : owner?.kind === 'mob'
            ? () => navigate('mobs', owner.template.type)
            : undefined;
        const pct = Math.round(s.chance * 100);
        const qty = s.quantity.min === s.quantity.max ? `${s.quantity.min}` : `${s.quantity.min}-${s.quantity.max}`;
        return (
          <span key={`${s.tableId}-${i}`}>
            {i > 0 && ', '}
            <button type="button" className="wiki-effect-chip" onClick={onClick} disabled={!onClick}>
              {label} ({pct}% · {qty})
            </button>
          </span>
        );
      })}
    </small>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="wiki-pair">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
