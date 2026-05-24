import { useEffect, useRef, useState } from 'react';
import { QUESTS } from '../../../../packages/content/quests';
import { playCue } from '../sfx';

type QuestCompleteBurstProps = {
  /** Player's completed-quests list (id strings). Watched for new entries. */
  completed: readonly string[];
};

/**
 * Smaller cousin of the LevelUp burst — fires when a new quest
 * id lands in player.questState.completed. Displays the quest
 * name + a 2.4 s gold flash. Plays the levelUp SFX cue so it
 * still has audio weight; the visual is intentionally smaller
 * than LevelUpBurst so leveling stays the bigger event.
 */
export function QuestCompleteBurst({ completed }: QuestCompleteBurstProps) {
  const seenRef = useRef<Set<string>>(new Set(completed));
  const [burst, setBurst] = useState<{ key: number; name: string } | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const newly: string[] = [];
    for (const id of completed) {
      if (!seenRef.current.has(id)) {
        seenRef.current.add(id);
        newly.push(id);
      }
    }
    if (newly.length === 0) return;
    // Show only the most recent completion — if a server resync
    // delivers several at once we don't want to stack flashes.
    const lastId = newly[newly.length - 1];
    const name = QUESTS[lastId]?.name ?? lastId;
    seqRef.current += 1;
    setBurst({ key: seqRef.current, name });
    playCue('levelUp');
    const t = window.setTimeout(() => setBurst(null), 2400);
    return () => window.clearTimeout(t);
  }, [completed]);

  if (!burst) return null;
  return (
    <div className="quest-complete-burst" key={burst.key} aria-live="polite">
      <span className="quest-complete-burst__title">Quest Complete</span>
      <span className="quest-complete-burst__name">{burst.name}</span>
    </div>
  );
}
