import { useMemo, useState } from 'react';
import { listMobTemplates, getMobZones } from '../../../../packages/content/mobLocations';
import { getMiniBossesByMobType } from '../../../../packages/content/miniBosses';
import { LootDropsForTable } from './WikiLoot';
import { FocusableLi, filterMatch, type WikiNav } from './WikiPanel';
import { WikiFilters, type WikiFilterChip } from './WikiFilters';

type MobSortId = 'name' | 'level' | 'family';
const MOB_SORTS: ReadonlyArray<{ id: MobSortId; label: string }> = [
  { id: 'name', label: 'Name (A→Z)' },
  { id: 'level', label: 'Level' },
  { id: 'family', label: 'Family' },
];

export function MobsTab({
  query, focusId, focusKey, onShowMarker, navigate,
}: {
  query: string;
  focusId: string | null;
  focusKey: string;
  onShowMarker?: (pos: { x: number; z: number } | null) => void;
  navigate: WikiNav;
}) {
  const [familyIds, setFamilyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [sortId, setSortId] = useState<MobSortId>('level');
  const queried = useMemo(() => listMobTemplates().filter((t) =>
    filterMatch(`${t.type} ${t.displayName} ${t.family}`, query),
  ), [query]);
  const allFamilies = useMemo(() => {
    const fams = new Set<string>();
    for (const t of listMobTemplates()) fams.add(t.family);
    return Array.from(fams).sort();
  }, []);
  const rows = useMemo(() => {
    let out = queried;
    if (familyIds.size > 0) out = out.filter((t) => familyIds.has(t.family));
    const mobLevel = (t: typeof out[number]): number => {
      const zones = getMobZones(t.type);
      return zones.length > 0 ? Math.min(...zones.map((z) => z.zone.minLevel)) : 999;
    };
    const compare = (a: typeof out[number], b: typeof out[number]): number => {
      if (sortId === 'name') return a.displayName.localeCompare(b.displayName);
      if (sortId === 'level') return (mobLevel(a) - mobLevel(b)) || a.displayName.localeCompare(b.displayName);
      return a.family.localeCompare(b.family) || a.displayName.localeCompare(b.displayName);
    };
    return [...out].sort(compare);
  }, [queried, familyIds, sortId]);
  const chips: WikiFilterChip[] = allFamilies.map((f) => ({ id: `fam:${f}`, label: f, active: familyIds.has(f) }));
  const toggleChip = (id: string) => {
    if (!id.startsWith('fam:')) return;
    const key = id.slice(4);
    const next = new Set(familyIds);
    if (next.has(key)) next.delete(key); else next.add(key);
    setFamilyIds(next);
  };
  return (
    <>
      <WikiFilters
        chips={chips}
        onToggleChip={toggleChip}
        onResetChips={() => setFamilyIds(new Set())}
        sortOptions={MOB_SORTS.map((s) => ({ id: s.id, label: s.label }))}
        sortId={sortId}
        onSortChange={(id) => setSortId(id as MobSortId)}
        count={rows.length}
        total={queried.length}
      />
      <ul className="wiki-list">
        {rows.map((tpl) => (
          <MobLi key={tpl.type} tpl={tpl} focusId={focusId} focusKey={focusKey} onShowMarker={onShowMarker} navigate={navigate} />
        ))}
      </ul>
    </>
  );
}

function MobLi({
  tpl, focusId, focusKey, onShowMarker, navigate,
}: {
  tpl: ReturnType<typeof listMobTemplates>[number];
  focusId: string | null;
  focusKey: string;
  onShowMarker?: (pos: { x: number; z: number } | null) => void;
  navigate: WikiNav;
}) {
  const zones = getMobZones(tpl.type);
  const bosses = getMiniBossesByMobType(tpl.type);
  return (
    <FocusableLi isFocus={tpl.type === focusId} focusKey={focusKey}>
      <header>
        <strong>{tpl.displayName}</strong>
        <span className="wiki-row-tag">{tpl.family}</span>
      </header>
      <small className="wiki-row-footer">Type id: <code>{tpl.type}</code></small>
      <MobStatsSummary tpl={tpl} zones={zones} />
      {zones.length === 0 && <small className="wiki-row-footer">No known spawn zone.</small>}
      {zones.length > 0 && (
        <small className="wiki-row-footer">
          Spawns in:{' '}
          {zones.map((z, i) => (
            <span key={z.zone.id}>
              {i > 0 && ', '}
              <button type="button" className="wiki-effect-chip"
                onClick={() => onShowMarker?.({ x: z.position.x, z: z.position.z })}
                title={`${z.zone.name} (${Math.round(z.position.x)}, ${Math.round(z.position.z)})`}>
                {z.zone.name}
              </button>
            </span>
          ))}
        </small>
      )}
      {bosses.length > 0 && (
        <small className="wiki-row-footer">
          Boss variant:{' '}
          {bosses.map((b, i) => (
            <span key={b.id}>
              {i > 0 && ', '}
              <button type="button" className="wiki-effect-chip" onClick={() => navigate('bosses', b.id)}>{b.name}</button>
            </span>
          ))}
        </small>
      )}
      <LootDropsForTable tableId={`${tpl.type}_loot`} navigate={navigate} />
    </FocusableLi>
  );
}

function MobStatsSummary({
  tpl, zones,
}: {
  tpl: ReturnType<typeof listMobTemplates>[number];
  zones: ReturnType<typeof getMobZones>;
}) {
  const lvl = zones.length > 0 ? Math.min(...zones.map((z) => z.zone.minLevel)) : 1;
  const hp = Math.round((100 + lvl * 20) * tpl.stats.health);
  const dmg = Math.round((10 + lvl * 2) * tpl.stats.damage);
  return (
    <small className="wiki-row-footer">
      Lv {lvl}: <strong>{hp}</strong> HP · <strong>{dmg}</strong> dmg ·
      {' '}aggro {Math.round(15 * tpl.stats.aggroRadius)}m
      {tpl.stats.movementSpeed !== 1 && <> · speed ×{tpl.stats.movementSpeed.toFixed(2)}</>}
      {tpl.stats.attackRange !== 1 && <> · reach ×{tpl.stats.attackRange.toFixed(2)}</>}
    </small>
  );
}
