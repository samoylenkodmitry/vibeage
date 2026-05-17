import type { SkillId } from '../../../../packages/content/skills';
import { SKILLS } from '../../../../packages/content/skills';
import type { PlayerEntity } from '../gameTypes';
import { BASIC_ATTACK_HOTKEY, BASIC_ATTACK_SKILL_ID } from '../skillShortcuts';
import { useDraggablePanel } from './useDraggablePanel';

type ActionsPanelProps = {
  player: PlayerEntity | null;
  now: number;
  hasSelectedTarget: boolean;
  hasLootNearby: boolean;
  onCastSkill: (skillId: SkillId) => void;
  onPickupNearest: () => void;
};

export function ActionsPanel({
  player,
  now,
  hasSelectedTarget,
  hasLootNearby,
  onCastSkill,
  onPickupNearest,
}: ActionsPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('actions');
  const attackSkill = SKILLS[BASIC_ATTACK_SKILL_ID];
  const attackCdEnd = player?.skillCooldownEndTs?.[BASIC_ATTACK_SKILL_ID] ?? 0;
  const attackCdRemaining = Math.max(0, attackCdEnd - now);
  const attackReady = attackCdRemaining === 0;
  const attackDisabled = !player?.isAlive || !attackReady || !hasSelectedTarget;

  return (
    <section ref={panelRef} className="actions-panel" aria-label="Actions">
      <div className="panel-title">
        <strong>Actions</strong>
        <span>tap or hotkey</span>
      </div>
      <div className="actions-panel-grid">
        <ActionButton
          label="Attack"
          hotkey={BASIC_ATTACK_HOTKEY}
          disabled={attackDisabled}
          subtitle={
            !player?.isAlive
              ? 'Dead'
              : !hasSelectedTarget
                ? 'Pick target'
                : attackReady
                  ? `${attackSkill?.cooldownMs ? (attackSkill.cooldownMs / 1000).toFixed(1) : ''}s cd`
                  : `${(attackCdRemaining / 1000).toFixed(1)}s`
          }
          onClick={() => onCastSkill(BASIC_ATTACK_SKILL_ID)}
        />
        <ActionButton
          label="Pickup"
          hotkey="F"
          disabled={!player?.isAlive || !hasLootNearby}
          subtitle={!player?.isAlive ? 'Dead' : hasLootNearby ? 'Walk to nearest' : 'No loot'}
          onClick={onPickupNearest}
        />
      </div>
    </section>
  );
}

function ActionButton({
  label,
  hotkey,
  disabled,
  subtitle,
  onClick,
}: {
  label: string;
  hotkey: string;
  disabled: boolean;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="action-button"
      disabled={disabled}
      aria-label={`${label} (${hotkey})`}
      aria-keyshortcuts={hotkey}
      onClick={onClick}
    >
      <span className="action-button__hotkey">{hotkey}</span>
      <strong className="action-button__label">{label}</strong>
      <small className="action-button__sub">{subtitle}</small>
    </button>
  );
}
