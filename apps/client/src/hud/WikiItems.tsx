import { useEffect, useMemo, useRef, useState } from 'react';
import { EQUIPMENT_SETS } from '../../../../packages/content/equipmentSets';
import { getGradeSpec, GRADE_SPECS, type ItemGrade } from '../../../../packages/content/equipmentTypes';
import { ITEMS, type Item } from '../../../../packages/content/items';
import { getLootSourcesForItem, resolveLootTableOwner } from '../../../../packages/content/lootSources';
import {
  getQuestRewardSourcesFor,
  getVendorSourcesFor,
} from '../../../../packages/content/obtainability';
import type { WikiNav } from './WikiBosses';
import { recipesProducing, recipesUsingMaterial } from './WikiRecipes';
import { WikiFilters, type WikiFilterChip } from './WikiFilters';

/**
 * PR T+U — Wiki Items tab. Cross-links every item to its drop
 * sources (mobs / bosses) and its recipes (used-in / crafted-from).
 * Reads `ITEMS` directly so adding a new item or recipe in content
 * lights up here automatically; no manual registration anywhere.
 */
const TYPE_FILTERS: ReadonlyArray<{ id: string; label: string; match: (item: Item) => boolean }> = [
  { id: 'weapon', label: 'Weapons', match: (i) => i.type === 'weapon' || i.kind === 'weapon' },
  { id: 'armor', label: 'Armor', match: (i) => i.kind === 'armor' || i.kind === 'shield' },
  { id: 'jewelry', label: 'Jewelry', match: (i) => i.kind === 'jewelry' },
  { id: 'consumable', label: 'Consumables', match: (i) => i.type === 'consumable' },
  { id: 'recipe', label: 'Recipes', match: (i) => i.type === 'recipe' },
  { id: 'material', label: 'Materials', match: (i) => i.type === 'material' },
];

type ItemSortId = 'name' | 'gradeHigh' | 'gradeLow' | 'level';
const ITEM_SORTS: ReadonlyArray<{ id: ItemSortId; label: string; compare: (a: Item, b: Item) => number }> = [
  { id: 'name', label: 'Name (A→Z)', compare: (a, b) => a.name.localeCompare(b.name) },
  { id: 'gradeHigh', label: 'Grade (S→D)', compare: (a, b) => (GRADE_SPECS[b.grade ?? 'none'].rank - GRADE_SPECS[a.grade ?? 'none'].rank) || a.name.localeCompare(b.name) },
  { id: 'gradeLow', label: 'Grade (D→S)', compare: (a, b) => (GRADE_SPECS[a.grade ?? 'none'].rank - GRADE_SPECS[b.grade ?? 'none'].rank) || a.name.localeCompare(b.name) },
  { id: 'level', label: 'Lv requirement', compare: (a, b) => (effectiveMin(a) - effectiveMin(b)) || a.name.localeCompare(b.name) },
];

function effectiveMin(item: Item): number {
  const grade = (item.grade ?? 'none') as ItemGrade;
  return Math.max(GRADE_SPECS[grade]?.minLevel ?? 1, item.equip?.requirements?.minLevel ?? 0);
}

export function ItemsTab({
  query, focusId, focusKey, navigate,
}: { query: string; focusId: string | null; focusKey: string; navigate: WikiNav }) {
  const [typeIds, setTypeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [gradeIds, setGradeIds] = useState<ReadonlySet<string>>(() => new Set());
  const [sortId, setSortId] = useState<ItemSortId>('name');

  const queried = useMemo(() => Object.values(ITEMS).filter((i) =>
    matches(`${i.name} ${i.description} ${i.type ?? ''} ${i.kind ?? ''}`, query),
  ), [query]);

  const rows = useMemo(() => {
    let out = queried;
    if (typeIds.size > 0) {
      out = out.filter((it) => TYPE_FILTERS.some((f) => typeIds.has(f.id) && f.match(it)));
    }
    if (gradeIds.size > 0) {
      out = out.filter((it) => gradeIds.has(it.grade ?? 'none'));
    }
    const sort = ITEM_SORTS.find((s) => s.id === sortId) ?? ITEM_SORTS[0];
    return [...out].sort(sort.compare);
  }, [queried, typeIds, gradeIds, sortId]);

  const chips: WikiFilterChip[] = [
    ...TYPE_FILTERS.map((f) => ({ id: `type:${f.id}`, label: f.label, active: typeIds.has(f.id) })),
    ...Object.values(GRADE_SPECS).filter((g) => g.id !== 'none').map((g) => ({
      id: `grade:${g.id}`, label: g.label, active: gradeIds.has(g.id), color: g.color,
    })),
  ];
  const toggleChip = (id: string) => {
    if (id.startsWith('type:')) {
      const key = id.slice(5);
      const next = new Set(typeIds);
      if (next.has(key)) next.delete(key); else next.add(key);
      setTypeIds(next);
    } else if (id.startsWith('grade:')) {
      const key = id.slice(6);
      const next = new Set(gradeIds);
      if (next.has(key)) next.delete(key); else next.add(key);
      setGradeIds(next);
    }
  };
  const resetChips = () => { setTypeIds(new Set()); setGradeIds(new Set()); };

  return (
    <>
      <WikiFilters
        chips={chips}
        onToggleChip={toggleChip}
        onResetChips={resetChips}
        sortOptions={ITEM_SORTS.map((s) => ({ id: s.id, label: s.label }))}
        sortId={sortId}
        onSortChange={(id) => setSortId(id as ItemSortId)}
        count={rows.length}
        total={queried.length}
      />
      <ul className="wiki-list">
        {rows.map((item) => (
          <ItemLi key={item.id} item={item} isFocus={item.id === focusId} focusKey={focusKey} navigate={navigate} />
        ))}
      </ul>
    </>
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
        {item.grade && item.grade !== 'none' && <GradePair grade={item.grade} />}
      </dl>
      <ItemSourcesSummary item={item} navigate={navigate} />
      {item.recipe && <ItemRecipeContents item={item} navigate={navigate} />}
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

/**
 * For an item with a `recipe` payload (i.e. it IS a recipe), render
 * the inputs + output inline so the player doesn't have to bounce
 * to the Recipes tab to see what the recipe makes. Single source
 * of truth: same `item.recipe` field the engine consumes when the
 * player uses the recipe in their bag.
 */
function ItemRecipeContents({ item, navigate }: { item: Item; navigate: WikiNav }) {
  const spec = item.recipe!;
  const outputItem = ITEMS[spec.output.itemId];
  return (
    <>
      <small className="wiki-row-footer">
        Recipe inputs:{' '}
        {spec.inputs.map((inp, i) => {
          const it = ITEMS[inp.itemId];
          return (
            <span key={`${inp.itemId}-${i}`}>
              {i > 0 && ', '}
              <button type="button" className="wiki-effect-chip" onClick={() => navigate('items', inp.itemId)}>
                {(it?.name ?? inp.itemId)} ×{inp.quantity}
              </button>
            </span>
          );
        })}
      </small>
      <small className="wiki-row-footer">
        Recipe output:{' '}
        <button type="button" className="wiki-effect-chip" onClick={() => navigate('items', spec.output.itemId)}>
          {(outputItem?.name ?? spec.output.itemId)} ×{spec.output.quantity}
        </button>
      </small>
    </>
  );
}

/**
 * Combined source block for an item. Renders the four source-type
 * lines (drop / vendor / quest-reward / recipe) when each has
 * entries; when ALL are empty, surfaces a clear "no source yet"
 * banner so the player knows the item is a placeholder rather
 * than something they failed to find. Currency is exempt — it's
 * obtained via gold credit, not item drops.
 */
function ItemSourcesSummary({ item, navigate }: { item: Item; navigate: WikiNav }) {
  const dropSources = getLootSourcesForItem(item.id);
  const vendorSources = getVendorSourcesFor(item.id);
  const questSources = getQuestRewardSourcesFor(item.id);
  const usedIn = recipesUsingMaterial(item.id);
  const craftedBy = recipesProducing(item.id);
  const hasAny =
    dropSources.length > 0
    || vendorSources.length > 0
    || questSources.length > 0
    || craftedBy.length > 0;
  return (
    <>
      <ItemDropSources itemId={item.id} navigate={navigate} sources={dropSources} />
      <ItemVendorSources itemId={item.id} navigate={navigate} sources={vendorSources} />
      <ItemQuestRewardSources itemId={item.id} navigate={navigate} sources={questSources} />
      <ItemRecipeLinks itemId={item.id} navigate={navigate} usedIn={usedIn} craftedBy={craftedBy} />
      {!hasAny && item.type !== 'currency' && (
        <small className="wiki-row-footer wiki-row-footer--warn">
          ⚠ No source yet — placeholder item, not obtainable in-world. See <code>docs/UNLINKED.md</code>.
        </small>
      )}
    </>
  );
}

function ItemRecipeLinks({
  itemId, navigate, usedIn, craftedBy,
}: {
  itemId: string;
  navigate: WikiNav;
  usedIn: ReturnType<typeof recipesUsingMaterial>;
  craftedBy: ReturnType<typeof recipesProducing>;
}) {
  void itemId;
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

function ItemDropSources({
  itemId, navigate, sources,
}: {
  itemId: string;
  navigate: WikiNav;
  sources: ReturnType<typeof getLootSourcesForItem>;
}) {
  void itemId;
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

function ItemVendorSources({
  itemId, navigate, sources,
}: {
  itemId: string;
  navigate: WikiNav;
  sources: ReturnType<typeof getVendorSourcesFor>;
}) {
  void itemId;
  if (sources.length === 0) return null;
  return (
    <small className="wiki-row-footer">
      Sold by:{' '}
      {sources.map((s, i) => (
        <span key={`${s.vendorId}-${i}`}>
          {i > 0 && ', '}
          <button type="button" className="wiki-effect-chip" onClick={() => navigate('vendors', s.vendorId)}>
            {s.vendorName} ({s.price}g)
          </button>
        </span>
      ))}
    </small>
  );
}

function ItemQuestRewardSources({
  itemId, navigate, sources,
}: {
  itemId: string;
  navigate: WikiNav;
  sources: ReturnType<typeof getQuestRewardSourcesFor>;
}) {
  void itemId;
  if (sources.length === 0) return null;
  return (
    <small className="wiki-row-footer">
      Quest reward:{' '}
      {sources.map((s, i) => (
        <span key={`${s.questId}-${i}`}>
          {i > 0 && ', '}
          <button type="button" className="wiki-effect-chip" onClick={() => navigate('quests', s.questId)}>
            {s.questName}
          </button>
        </span>
      ))}
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

function GradePair({ grade }: { grade: import('../../../../packages/content/equipmentTypes').ItemGrade }) {
  const spec = getGradeSpec(grade);
  return (
    <div className="wiki-pair">
      <dt>Grade</dt>
      <dd>
        <span style={{ color: spec.color }} title={spec.description}>
          {spec.label} <small>(Lv {spec.minLevel}+)</small>
        </span>
      </dd>
    </div>
  );
}

function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
