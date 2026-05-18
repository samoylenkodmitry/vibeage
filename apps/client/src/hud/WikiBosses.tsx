import { useEffect, useMemo, useRef } from 'react';
import { ITEMS } from '../../../../packages/content/items';
import {
  listMiniBosses,
  type MiniBossSpec,
} from '../../../../packages/content/miniBosses';

export type WikiNav = (tab: WikiBossesNavTab, id: string) => void;
type WikiBossesNavTab = 'bosses' | 'items' | 'mobs';

/**
 * Wiki "Bosses" tab. Lifted out of WikiPanel.tsx to keep that file
 * under the 700-line maintainability cap. Renders one card per
 * mini-boss with lore + signature ability + cross-links to the
 * boss's trophy (Items tab) and base mob (Mobs tab).
 */
export function BossesTab({
  query, focusId, focusKey, navigate,
}: { query: string; focusId: string | null; focusKey: string; navigate: WikiNav }) {
  const rows = useMemo(() => listMiniBosses().filter((b) =>
    matches(`${b.id} ${b.name} ${b.mobType} ${b.zoneHint} ${b.signatureAbility.name}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((boss) => (
        <BossLi key={boss.id} boss={boss} isFocus={boss.id === focusId} focusKey={focusKey} navigate={navigate} />
      ))}
    </ul>
  );
}

function BossLi({
  boss, isFocus, focusKey, navigate,
}: { boss: MiniBossSpec; isFocus: boolean; focusKey: string; navigate: WikiNav }) {
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (isFocus && focusKey && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isFocus, focusKey]);
  const trophy = ITEMS[boss.trophyItemId];
  return (
    <li ref={ref} className={`wiki-row${isFocus ? ' wiki-row--focus' : ''}`}>
      <header>
        <strong>{boss.name}</strong>
        <span className="wiki-row-tag">{boss.zoneHint}</span>
      </header>
      <p>{boss.lore}</p>
      <div className="wiki-pair">
        <dt>Signature</dt>
        <dd>
          <strong>{boss.signatureAbility.name}</strong>
          {' — '}{boss.signatureAbility.description}
        </dd>
      </div>
      <small className="wiki-row-footer">
        Mob:{' '}
        <button type="button" className="wiki-effect-chip" onClick={() => navigate('mobs', boss.mobType)}>
          {boss.mobType}
        </button>
        {trophy && (
          <>
            {' · Trophy: '}
            <button type="button" className="wiki-effect-chip" onClick={() => navigate('items', trophy.id)}>
              {trophy.name}
            </button>
          </>
        )}
      </small>
    </li>
  );
}

function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
