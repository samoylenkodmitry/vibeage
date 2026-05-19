import { useMemo } from 'react';
import { QUEST_NPCS } from '../../../../packages/content/npcs';
import { QUESTS, type QuestDef } from '../../../../packages/content/quests';
import type { WikiNav } from './WikiBosses';

/**
 * Wiki "Quests" tab. Cross-links every kill / kill_boss objective
 * to its Mobs / Bosses entry and every reward item to its Items
 * entry, so a quest card is a hub into the rest of the wiki.
 */
export function QuestsTab({ query, navigate }: { query: string; navigate: WikiNav }) {
  const rows = useMemo(() => Object.values(QUESTS).filter((q) =>
    matches(`${q.name} ${q.description} ${q.npcId}`, query),
  ), [query]);
  return (
    <ul className="wiki-list">
      {rows.map((quest) => <QuestRow key={quest.id} quest={quest} navigate={navigate} />)}
    </ul>
  );
}

function QuestRow({ quest, navigate }: { quest: QuestDef; navigate: WikiNav }) {
  const giver = QUEST_NPCS[quest.npcId];
  type QuestTarget = { kind: 'boss' | 'mob'; id: string };
  const targets: QuestTarget[] = [];
  for (const s of quest.stages) {
    if (s.objective.kind === 'kill_boss') targets.push({ kind: 'boss', id: s.objective.bossId });
    else if (s.objective.kind === 'kill') targets.push({ kind: 'mob', id: s.objective.enemyType });
  }
  return (
    <li className="wiki-row">
      <header>
        <strong>{quest.name}</strong>
        <span className="wiki-row-tag">Lv {quest.minLevel}+</span>
      </header>
      <p>{quest.description}</p>
      {giver && (
        <small className="wiki-row-footer">
          Giver:{' '}
          <button type="button" className="wiki-effect-chip" onClick={() => navigate('npcs', giver.id)}>
            {giver.name}
          </button>
          {' '}({giver.title})
        </small>
      )}
      <small className="wiki-row-footer">Stages: {quest.stages.length}</small>
      {targets.length > 0 && (
        <small className="wiki-row-footer">
          Targets:{' '}
          {targets.map((t, i) => (
            <span key={`${t.kind}-${t.id}-${i}`}>
              {i > 0 && ', '}
              <button
                type="button"
                className="wiki-effect-chip"
                onClick={() => navigate(t.kind === 'boss' ? 'bosses' : 'mobs', t.id)}
              >{t.id}</button>
            </span>
          ))}
        </small>
      )}
      <small className="wiki-row-footer">
        Reward:
        {quest.reward.xp ? ` ${quest.reward.xp} XP` : ''}
        {quest.reward.gold ? ` · ${quest.reward.gold} gold` : ''}
        {quest.reward.items && quest.reward.items.length > 0 && (
          <>
            {' · '}
            {quest.reward.items.map((it, i) => (
              <span key={`${it.itemId}-${i}`}>
                {i > 0 && ', '}
                <button
                  type="button"
                  className="wiki-effect-chip"
                  onClick={() => navigate('items', it.itemId)}
                >{it.itemId}×{it.quantity ?? 1}</button>
              </span>
            ))}
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
