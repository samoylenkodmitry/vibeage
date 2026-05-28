import { useEffect, useMemo, useRef } from 'react';
import { QUEST_NPCS, type QuestNpcDef } from '../../../../packages/content/npcs';
import { npcIconPath } from '../../../../packages/content/npcIcons';
import { QUESTS, type QuestDef } from '../../../../packages/content/quests';
import type { WikiNav } from './WikiBosses';

/**
 * PR EE — Wiki NPCs tab. Reads QUEST_NPCS + QUESTS directly so the
 * record that drives in-game NPCs also drives the wiki entry. One
 * row per NPC with name, title, optional flavour description, and
 * a chip per quest they offer (cross-linked to the Quests tab).
 */
type OnShowMarker = (pos: { x: number; z: number } | null) => void;

export function NpcsTab({
  query, focusId, focusKey, navigate, onShowMarker,
}: { query: string; focusId: string | null; focusKey: string; navigate: WikiNav; onShowMarker?: OnShowMarker }) {
  // Pre-group quests by npcId once; QUESTS is static module state so
  // the deps are empty. Saves per-row Object.values().filter().
  const questsByNpc = useMemo(() => {
    const map: Record<string, QuestDef[]> = {};
    for (const q of Object.values(QUESTS)) {
      (map[q.npcId] ??= []).push(q);
    }
    return map;
  }, []);
  const npcs = useMemo(() => Object.values(QUEST_NPCS).filter((n) =>
    matches(`${n.id} ${n.name} ${n.title} ${n.description ?? ''}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {npcs.map((npc) => (
        <NpcLi
          key={npc.id}
          npc={npc}
          offers={questsByNpc[npc.id] ?? []}
          isFocus={npc.id === focusId}
          focusKey={focusKey}
          navigate={navigate}
          onShowMarker={onShowMarker}
        />
      ))}
    </ul>
  );
}

function NpcLi({
  npc, offers, isFocus, focusKey, navigate, onShowMarker,
}: { npc: QuestNpcDef; offers: QuestDef[]; isFocus: boolean; focusKey: string; navigate: WikiNav; onShowMarker?: OnShowMarker }) {
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (isFocus && focusKey && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isFocus, focusKey]);
  return (
    <li ref={ref} className={`wiki-row wiki-row--with-portrait${isFocus ? ' wiki-row--focus' : ''}`}>
      <img className="wiki-row-portrait" src={npcIconPath(npc.id)} alt="" aria-hidden="true" />
      <div className="wiki-row-body">
        <header>
          <strong>{npc.name}</strong>
          <span className="wiki-row-tag">{npc.title}</span>
        </header>
        {npc.description && <p>{npc.description}</p>}
      <small className="wiki-row-footer">
        At{' '}
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
      {offers.length > 0 && (
        <small className="wiki-row-footer">
          Offers:{' '}
          {offers.map((q, i) => (
            <span key={q.id}>
              {i > 0 && ', '}
              <button type="button" className="wiki-effect-chip" onClick={() => navigate('quests', q.id)}>
                {q.name}
              </button>
            </span>
          ))}
        </small>
      )}
      </div>
    </li>
  );
}

function matches(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
