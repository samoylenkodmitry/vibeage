import type { EnemyEntity, GameClientState } from '../gameTypes';

type AutoAttackChipProps = {
  autoAttack: GameClientState['autoAttack'];
  enemies: Record<string, EnemyEntity>;
};

/**
 * Tiny chip near the casting panel showing "Auto-attacking: <enemy>"
 * whenever the client has an active autoAttack target. Helps the
 * player notice that their basic attack is repeating (e.g. after a
 * click-on-selected-target started one) and which mob it's pointed
 * at — easy to forget mid-pull.
 *
 * Renders nothing when autoAttack is null or the target enemy
 * doesn't exist client-side anymore (despawn, regional unload).
 */
export function AutoAttackChip({ autoAttack, enemies }: AutoAttackChipProps) {
  if (!autoAttack) return null;
  const target = enemies[autoAttack.targetId];
  if (!target) return null;
  return (
    <div className="auto-attack-chip" data-testid="auto-attack-chip" aria-live="polite">
      <span className="auto-attack-chip__dot" aria-hidden="true" />
      <span className="auto-attack-chip__label">Auto-attacking</span>
      <strong className="auto-attack-chip__target">{target.name}</strong>
    </div>
  );
}
