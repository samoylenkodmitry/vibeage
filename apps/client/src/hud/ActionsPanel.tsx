import type { CSSProperties } from 'react';
import { GAME_ACTIONS, type GameActionId } from '../../../../packages/content/actions';
import type { SkillId } from '../../../../packages/content/skills';
import { SKILLS } from '../../../../packages/content/skills';
import type { PlayerEntity } from '../gameTypes';
import { BASIC_ATTACK_HOTKEY, BASIC_ATTACK_SKILL_ID } from '../skillShortcuts';
import { SkillTooltip } from './SkillTooltip';
import { useActionBarDrag, type BarDragPayload } from './actionBarDrag';
import { useDraggablePanel } from './useDraggablePanel';
import { useHasMousePointer } from './useHasMousePointer';
import { useNow } from './useNow';
import { useTooltipTrigger } from './useTooltipTrigger';
import { ACTION_DRAG_MIME, SKILL_DRAG_MIME } from './useActionBar';

type ActionsPanelProps = {
  player: PlayerEntity | null;
  hasSelectedTarget: boolean;
  hasLootNearby: boolean;
  hasNavigationMarker: boolean;
  onCastSkill: (skillId: SkillId) => void;
  onPickupNearest: () => void;
  onMove: () => void;
};

export function ActionsPanel({
  player,
  hasSelectedTarget,
  hasLootNearby,
  hasNavigationMarker,
  onCastSkill,
  onPickupNearest,
  onMove,
}: ActionsPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('actions');
  // Own the cooldown clock locally (only ticks while the panel is
  // open) instead of taking it from GameHud's tree-wide useNow.
  const now = useNow(100);
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
          label={GAME_ACTIONS.attack.label}
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
          dragSkillId={BASIC_ATTACK_SKILL_ID}
          iconSrc={GAME_ACTIONS.attack.icon}
        />
        <ActionButton
          label={GAME_ACTIONS.move.label}
          hotkey={GAME_ACTIONS.move.hotkey}
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
          dragActionId="move"
          iconSrc={GAME_ACTIONS.move.icon}
        />
        <ActionButton
          label={GAME_ACTIONS.pickup.label}
          hotkey={GAME_ACTIONS.pickup.hotkey}
          disabled={!player?.isAlive || !hasLootNearby}
          subtitle={!player?.isAlive ? 'Dead' : hasLootNearby ? 'Walk to nearest' : 'No loot'}
          onClick={onPickupNearest}
          dragActionId="pickup"
          iconSrc={GAME_ACTIONS.pickup.icon}
        />
        <EscapeButton player={player} now={now} onCastSkill={onCastSkill} tooltip={tooltip} />
      </div>
      {tooltip.info && (
        <SkillTooltip
          skillId={tooltip.info.payload}
          clientX={tooltip.info.clientX}
          clientY={tooltip.info.clientY}
          skillLevel={player?.skillLevels?.[tooltip.info.payload] ?? 1}
          player={player}
          hoverHandlers={tooltip.hoverHandlers}
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
      hotkey={GAME_ACTIONS.escape.hotkey}
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
      dragSkillId={'escape' as SkillId}
      iconSrc={GAME_ACTIONS.escape.icon}
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
  dragSkillId,
  dragActionId,
  iconSrc,
}: {
  label: string;
  hotkey: string;
  disabled: boolean;
  subtitle: string;
  onClick: () => void;
  extraHandlers?: React.HTMLAttributes<HTMLButtonElement>;
  /** Bind this skill onto the action bar when dragged (Attack/Escape). */
  dragSkillId?: SkillId;
  /** Bind this built-in action onto the action bar when dragged (Move/Pickup). */
  dragActionId?: GameActionId;
  iconSrc?: string;
}) {
  const { beginDrag, consumeDragClick } = useActionBarDrag();
  const hasMouse = useHasMousePointer();
  const payload: BarDragPayload | null = dragSkillId
    ? { kind: 'skill', id: dragSkillId }
    : dragActionId
      ? { kind: 'action', id: dragActionId }
      : null;
  const isDragSource = payload !== null;
  // aria-disabled (not the native attribute) so a cast-disabled action — e.g.
  // Attack with no target, Escape on cooldown — can still be dragged onto the
  // bar. The click handler ignores activation while disabled.
  return (
    <button
      type="button"
      className="action-button"
      aria-disabled={disabled}
      aria-label={`${label} (${hotkey})`}
      aria-keyshortcuts={hotkey}
      style={iconSrc ? ({ '--action-icon': `url("${iconSrc}")` } as CSSProperties) : undefined}
      draggable={isDragSource && hasMouse}
      onDragStart={payload ? (e) => {
        e.dataTransfer.effectAllowed = 'copy';
        if (payload.kind === 'skill') e.dataTransfer.setData(SKILL_DRAG_MIME, JSON.stringify({ skillId: payload.id }));
        else if (payload.kind === 'action') e.dataTransfer.setData(ACTION_DRAG_MIME, JSON.stringify({ actionId: payload.id }));
      } : undefined}
      onClick={(e) => {
        if (isDragSource && consumeDragClick()) {
          e.preventDefault();
          return;
        }
        if (disabled) return;
        onClick();
      }}
      {...(extraHandlers ?? {})}
      {...(payload ? { onPointerDown: (e: React.PointerEvent) => beginDrag(payload, e, label) } : {})}
    >
      <span className="action-button__hotkey">{hotkey}</span>
      <strong className="action-button__label">{label}</strong>
      <small className="action-button__sub">{subtitle}</small>
    </button>
  );
}
