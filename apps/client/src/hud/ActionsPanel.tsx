import type { SkillId } from '../../../../packages/content/skills';
import { SKILLS } from '../../../../packages/content/skills';
import type { PlayerEntity } from '../gameTypes';
import { BASIC_ATTACK_HOTKEY, BASIC_ATTACK_SKILL_ID } from '../skillShortcuts';
import { SkillTooltip } from './SkillTooltip';
import { useDraggablePanel } from './useDraggablePanel';
import { useTooltipTrigger } from './useTooltipTrigger';

type ActionsPanelProps = {
  player: PlayerEntity | null;
  now: number;
  hasSelectedTarget: boolean;
  hasLootNearby: boolean;
  hasNavigationMarker: boolean;
  onCastSkill: (skillId: SkillId) => void;
  onPickupNearest: () => void;
  onMove: () => void;
};

export function ActionsPanel({
  player,
  now,
  hasSelectedTarget,
  hasLootNearby,
  hasNavigationMarker,
  onCastSkill,
  onPickupNearest,
  onMove,
}: ActionsPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('actions');
  const attackSkill = SKILLS[BASIC_ATTACK_SKILL_ID];
  const attackCdEnd = player?.skillCooldownEndTs?.[BASIC_ATTACK_SKILL_ID] ?? 0;
  const attackCdRemaining = Math.max(0, attackCdEnd - now);
  const attackReady = attackCdRemaining === 0;
  const attackDisabled = !player?.isAlive || !attackReady || !hasSelectedTarget;
  const tooltip = useTooltipTrigger<SkillId>();

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
          extraHandlers={tooltip.triggerProps(BASIC_ATTACK_SKILL_ID)}
        />
        <ActionButton
          label="Move"
          hotkey="M"
          disabled={!player?.isAlive || (!hasSelectedTarget && !hasNavigationMarker)}
          subtitle={
            !player?.isAlive
              ? 'Dead'
              : hasSelectedTarget
                ? 'Walk to target'
                : hasNavigationMarker
                  ? 'Walk to map pin'
                  : 'Pick target or pin'
          }
          onClick={onMove}
        />
        <ActionButton
          label="Pickup"
          hotkey="F"
          disabled={!player?.isAlive || !hasLootNearby}
          subtitle={!player?.isAlive ? 'Dead' : hasLootNearby ? 'Walk to nearest' : 'No loot'}
          onClick={onPickupNearest}
        />
        <EscapeButton player={player} now={now} onCastSkill={onCastSkill} tooltip={tooltip} />
      </div>
      {tooltip.info && (
        <SkillTooltip
          skillId={tooltip.info.payload}
          clientX={tooltip.info.clientX}
          clientY={tooltip.info.clientY}
          skillLevel={player?.skillLevels?.[tooltip.info.payload] ?? 1}
        />
      )}
    </section>
  );
}

function EscapeButton({
  player,
  now,
  onCastSkill,
  tooltip,
}: {
  player: PlayerEntity | null;
  now: number;
  onCastSkill: (skillId: SkillId) => void;
  tooltip: ReturnType<typeof useTooltipTrigger<SkillId>>;
}) {
  const escapeSkill = SKILLS.escape;
  if (!escapeSkill) return null;
  // Escape is a universal skill (granted at hydrate); it shows here
  // unconditionally so players always know how to recall. Cooldown
  // display mirrors the Attack button. Numbers come from SKILLS.escape
  // (cast / cooldown) so retuning the skill keeps the label in sync.
  const cdEnd = player?.skillCooldownEndTs?.escape ?? 0;
  const cdRemaining = Math.max(0, cdEnd - now);
  const ready = cdRemaining === 0;
  const casting = player?.castingSkill === 'escape';
  const disabled = !player?.isAlive || !ready || casting;
  const cdMin = Math.ceil(cdRemaining / 60_000);
  const castSeconds = ((escapeSkill.castMs ?? 0) / 1000).toFixed(0);
  const cooldownMinutes = ((escapeSkill.cooldownMs ?? 0) / 60_000).toFixed(0);
  return (
    <ActionButton
      label="Escape"
      hotkey="Z"
      disabled={disabled}
      subtitle={
        !player?.isAlive
          ? 'Dead'
          : casting
            ? `Channeling ${castSeconds}s`
            : ready
              ? `${castSeconds}s cast · ${cooldownMinutes}m cd`
              : `${cdMin}m`
      }
      onClick={() => onCastSkill('escape')}
      extraHandlers={tooltip.triggerProps('escape' as SkillId)}
    />
  );
}

function ActionButton({
  label,
  hotkey,
  disabled,
  subtitle,
  onClick,
  extraHandlers,
}: {
  label: string;
  hotkey: string;
  disabled: boolean;
  subtitle: string;
  onClick: () => void;
  extraHandlers?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      className="action-button"
      disabled={disabled}
      aria-label={`${label} (${hotkey})`}
      aria-keyshortcuts={hotkey}
      onClick={onClick}
      {...(extraHandlers ?? {})}
    >
      <span className="action-button__hotkey">{hotkey}</span>
      <strong className="action-button__label">{label}</strong>
      <small className="action-button__sub">{subtitle}</small>
    </button>
  );
}
