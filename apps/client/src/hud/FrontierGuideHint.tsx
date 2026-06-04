import type { PlayerEntity } from '../gameTypes';
import { useDismissibleHint } from './useDismissibleHint';

type FrontierGuideHintProps = {
  player: PlayerEntity | null;
  onOpenQuestPanel: () => void;
};

export type FrontierGuideHintCopy = {
  npcName: string;
  levelRange: string;
};

export function FrontierGuideHint({ player, onOpenQuestPanel }: FrontierGuideHintProps) {
  const { dismissed, dismiss } = useDismissibleHint('frontier-guide');
  const hint = pickFrontierGuideHint(player);
  if (dismissed || !hint) return null;
  return (
    <section className="specialization-hint frontier-guide-hint" role="status" aria-live="polite">
      <strong>Frontier route ready</strong>
      <small>{hint.npcName} has {hint.levelRange} postings near Gludin.</small>
      <button type="button" className="specialization-hint-action" onClick={onOpenQuestPanel}>Quests</button>
      <button type="button" className="hint-dismiss" aria-label="Dismiss hint" onClick={dismiss}>×</button>
    </section>
  );
}

export function pickFrontierGuideHint(player: PlayerEntity | null): FrontierGuideHintCopy | null {
  if (!player?.isAlive) return null;
  if (!player.specializationId) return null;
  const level = player.level ?? 1;
  if (level < 20 || level > 30) return null;
  return { npcName: 'Roadwarden Saila', levelRange: 'Lv 24-30' };
}
