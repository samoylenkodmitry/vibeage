import { SPECIALIZATION_UNLOCK_LEVEL } from '../../../../packages/content/specializations';
import type { PlayerEntity } from '../gameTypes';
import { capitalize, DEFAULT_CLASS_NAME } from './textUtils';
import { useDismissibleHint } from './useDismissibleHint';

type SpecializationHintProps = {
  player: PlayerEntity | null;
  onOpenSkills: () => void;
};

export type SpecializationHintCopy = {
  className: string;
};

export function SpecializationHint({ player, onOpenSkills }: SpecializationHintProps) {
  const { dismissed, dismiss } = useDismissibleHint('specialization');
  const hint = pickSpecializationHint(player);
  if (dismissed || !hint) return null;
  return (
    <section className="specialization-hint" role="status" aria-live="polite">
      <strong>Specialization ready</strong>
      <small>{hint.className} can choose a path now.</small>
      <button type="button" className="specialization-hint-action" onClick={onOpenSkills}>Skills</button>
      <button type="button" className="hint-dismiss" aria-label="Dismiss hint" onClick={dismiss}>×</button>
    </section>
  );
}

export function pickSpecializationHint(player: PlayerEntity | null): SpecializationHintCopy | null {
  if (!player?.isAlive) return null;
  if (player.specializationId) return null;
  if ((player.level ?? 1) < SPECIALIZATION_UNLOCK_LEVEL) return null;
  return { className: capitalize(player.className ?? DEFAULT_CLASS_NAME) };
}
