import { useEffect, useMemo, useRef } from 'react';
import { ITEMS } from '../../../../packages/content/items';
import { QUEST_NPCS } from '../../../../packages/content/npcs';
import { VENDORS, type VendorDef } from '../../../../packages/content/vendors';
import type { WikiNav } from './WikiBosses';

/**
 * PR GG — Wiki Vendors tab. Reads the same VENDORS registry that
 * the in-game vendor dialog reads, so the wiki price list and the
 * shop UI can never disagree. Each row cross-links to the vendor's
 * NPC (Npcs tab) and to each stocked item (Items tab).
 */
type OnShowMarker = (pos: { x: number; z: number } | null) => void;

export function VendorsTab({
  query, focusId, focusKey, navigate, onShowMarker,
}: { query: string; focusId: string | null; focusKey: string; navigate: WikiNav; onShowMarker?: OnShowMarker }) {
  const rows = useMemo(() => Object.values(VENDORS).filter((v) =>
    matches(`${v.id} ${v.name} ${v.title} ${v.description ?? ''}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((vendor) => (
        <VendorLi
          key={vendor.id}
          vendor={vendor}
          isFocus={vendor.id === focusId}
          focusKey={focusKey}
          navigate={navigate}
          onShowMarker={onShowMarker}
        />
      ))}
    </ul>
  );
}

function VendorLi({
  vendor, isFocus, focusKey, navigate, onShowMarker,
}: { vendor: VendorDef; isFocus: boolean; focusKey: string; navigate: WikiNav; onShowMarker?: OnShowMarker }) {
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (isFocus && focusKey && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isFocus, focusKey]);
  const npc = QUEST_NPCS[vendor.npcId];
  return (
    <li ref={ref} className={`wiki-row${isFocus ? ' wiki-row--focus' : ''}`}>
      <header>
        <strong>{vendor.name}</strong>
        <span className="wiki-row-tag">{vendor.title}</span>
      </header>
      <p>{vendor.description}</p>
      {npc && (
        <small className="wiki-row-footer">
          NPC:{' '}
          <button type="button" className="wiki-effect-chip" onClick={() => navigate('npcs', npc.id)}>
            {npc.name}
          </button>
          {' '}at{' '}
          <button
            type="button"
            className="wiki-effect-chip"
            onClick={() => onShowMarker?.({ x: npc.position.x, z: npc.position.z })}
            disabled={!onShowMarker}
            title={onShowMarker ? 'Show on map' : undefined}
          >
            ({Math.round(npc.position.x)}, {Math.round(npc.position.z)})
          </button>
        </small>
      )}
      {vendor.stock.length > 0 ? (
        <small className="wiki-row-footer">
          Stocks:{' '}
          {vendor.stock.map((entry, i) => {
            const item = ITEMS[entry.itemId];
            return (
              <span key={entry.itemId}>
                {i > 0 && ', '}
                <button type="button" className="wiki-effect-chip" onClick={() => navigate('items', entry.itemId)}>
                  {item?.name ?? entry.itemId} — {entry.price}g
                </button>
              </span>
            );
          })}
        </small>
      ) : (
        <small className="wiki-row-footer">Buys only (no stock).</small>
      )}
      {vendor.buyRate !== undefined && (
        <small className="wiki-row-footer">
          Pays {Math.round(vendor.buyRate * 100)}% of base for items sold to them.
        </small>
      )}
    </li>
  );
}

function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
