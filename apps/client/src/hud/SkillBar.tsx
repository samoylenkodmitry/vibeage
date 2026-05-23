import { useMemo, useState, type CSSProperties } from 'react';
import { SKILLS, type SkillId } from '../../../../packages/content/skills';
import type { PlayerEntity } from '../gameTypes';
import type { InventorySlot } from '../../../../packages/protocol/messages';
import {
  BASIC_ATTACK_HOTKEY,
  BASIC_ATTACK_SKILL_ID,
  getSkillSlotAriaHotkeys,
  resolveSlotBinding,
  SKILL_BAR_HOTKEYS,
  SKILL_BAR_ROW_COUNT,
  SKILL_BAR_SECONDARY_HOTKEYS,
  SKILL_BAR_SECONDARY_ROW_COUNT,
} from '../skillShortcuts';
import { SkillTooltip } from './SkillTooltip';
import { useTooltipTrigger } from './useTooltipTrigger';
import { openWikiAt } from './wikiNavBus';
import { INVENTORY_DRAG_MIME } from './InventorySlotButton';
import { ItemShortcutButton } from './ItemShortcutButton';
import { findBagSlotForItem } from './useItemShortcuts';

type SkillBarProps = {
  player: PlayerEntity | null;
  now: number;
  hasSelectedTarget: boolean;
  onCastSkill: (skillId: SkillId) => void;
  /** Per-slot client-side item bindings (length 20). */
  itemShortcuts: (string | null)[];
  inventory: InventorySlot[];
  onUseItem: (slotIndex: number) => void;
  onBindItem: (slotIndex: number, itemId: string) => void;
  onClearItem: (slotIndex: number) => void;
};

export function SkillBar(props: SkillBarProps) {
  const { player, itemShortcuts } = props;
  // Single source of truth for slot resolution (skill vs item vs
  // fallback) — `resolveSlotBinding` is shared with the keydown
  // handler in Hud.tsx, so a slot that renders a potion icon will
  // also fire the potion hotkey, and one that renders a skill
  // button will cast that skill. Drift between visible UI and key
  // press is unrepresentable.
  const primarySlots = useMemo(
    () => Array.from({ length: SKILL_BAR_ROW_COUNT }, (_, i) => resolveSlotBinding(player, itemShortcuts, i)),
    [player, itemShortcuts],
  );
  const secondarySlots = useMemo(
    () => Array.from({ length: SKILL_BAR_SECONDARY_ROW_COUNT }, (_, i) =>
      resolveSlotBinding(player, itemShortcuts, SKILL_BAR_ROW_COUNT + i)),
    [player, itemShortcuts],
  );
  const tooltip = useTooltipTrigger<SkillId>();
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const hasSecondaryContent = secondarySlots.some(Boolean);

  return (
    <section className="skill-bar" aria-label="Skills">
      <div className="skill-bar-anchor">
        <SkillButton
          skillId={BASIC_ATTACK_SKILL_ID} hotkey={BASIC_ATTACK_HOTKEY} ariaHotkeys={BASIC_ATTACK_HOTKEY}
          player={player} now={props.now} hasSelectedTarget={props.hasSelectedTarget}
          onCastSkill={props.onCastSkill} tooltipHandlers={tooltip.triggerProps(BASIC_ATTACK_SKILL_ID)}
        />
      </div>
      <div className="skill-bar-row">
        {primarySlots.map((binding, index) => (
          <SkillBarSlot
            key={`p${index}:${binding?.id ?? 'empty'}`}
            slotIndex={index} binding={binding} hotkey={SKILL_BAR_HOTKEYS[index] ?? ''}
            tooltip={tooltip} {...props}
          />
        ))}
      </div>
      {(hasSecondaryContent || secondaryOpen) && (
        <div className="skill-bar-row skill-bar-row--secondary">
          {secondarySlots.map((binding, index) => (
            <SkillBarSlot
              key={`s${index}:${binding?.id ?? 'empty'}`}
              slotIndex={SKILL_BAR_ROW_COUNT + index} binding={binding}
              hotkey={SKILL_BAR_SECONDARY_HOTKEYS[index] ?? ''} compact tooltip={tooltip} {...props}
            />
          ))}
        </div>
      )}
      <button type="button" className="skill-bar-fold"
        aria-label={secondaryOpen ? 'Hide secondary skill row' : 'Show secondary skill row'}
        aria-expanded={secondaryOpen || hasSecondaryContent}
        onClick={() => setSecondaryOpen((prev) => !prev)}>
        {(secondaryOpen || hasSecondaryContent) ? '▾ Q..P row' : '▴ Q..P row'}
      </button>
      {tooltip.info && (
        <SkillTooltip
          skillId={tooltip.info.payload} clientX={tooltip.info.clientX} clientY={tooltip.info.clientY}
          skillLevel={player?.skillLevels?.[tooltip.info.payload] ?? 1} hoverHandlers={tooltip.hoverHandlers}
        />
      )}
    </section>
  );
}

type TooltipApi = ReturnType<typeof useTooltipTrigger<SkillId>>;
type SkillBarSlotProps = SkillBarProps & {
  slotIndex: number;
  binding: ReturnType<typeof resolveSlotBinding>;
  hotkey: string;
  tooltip: TooltipApi;
  compact?: boolean;
};

function SkillBarSlot({
  slotIndex, binding, hotkey, compact, player, now, hasSelectedTarget, onCastSkill,
  inventory, onUseItem, onBindItem, onClearItem, tooltip,
}: SkillBarSlotProps) {
  const aria = getSkillSlotAriaHotkeys(slotIndex);
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(INVENTORY_DRAG_MIME)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(INVENTORY_DRAG_MIME);
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const payload = JSON.parse(raw) as { itemId?: string };
      if (typeof payload.itemId === 'string') onBindItem(slotIndex, payload.itemId);
    } catch { /* malformed payload */ }
  };
  return (
    <div className="skill-bar-slot" onDragOver={onDragOver} onDrop={onDrop}>
      {binding?.kind === 'item' ? (
        <ItemShortcutButton
          itemId={binding.id} hotkey={hotkey} ariaHotkeys={aria}
          count={inventory.filter((s) => s.itemId === binding.id).reduce((n, s) => n + s.quantity, 0)}
          onUse={() => {
            const idx = findBagSlotForItem(inventory, binding.id);
            if (idx !== null) onUseItem(idx);
          }}
          onClear={() => onClearItem(slotIndex)} compact={compact}
        />
      ) : (
        <SkillButton
          skillId={binding?.kind === 'skill' ? binding.id : null}
          hotkey={hotkey} ariaHotkeys={aria}
          player={player} now={now} hasSelectedTarget={hasSelectedTarget}
          onCastSkill={onCastSkill}
          tooltipHandlers={binding?.kind === 'skill' ? tooltip.triggerProps(binding.id) : undefined}
          compact={compact}
        />
      )}
    </div>
  );
}

function SkillButton({
  skillId, hotkey, ariaHotkeys, player, now, hasSelectedTarget, onCastSkill, tooltipHandlers, compact,
}: {
  skillId: SkillId | null;
  hotkey: string;
  ariaHotkeys: string;
  player: PlayerEntity | null;
  now: number;
  hasSelectedTarget: boolean;
  onCastSkill: (skillId: SkillId) => void;
  tooltipHandlers?: React.HTMLAttributes<HTMLButtonElement>;
  compact?: boolean;
}) {
  const skill = skillId ? SKILLS[skillId] : null;
  const cooldownEnd = skillId ? player?.skillCooldownEndTs?.[skillId] ?? 0 : 0;
  const remainingMs = Math.max(0, cooldownEnd - now);
  const isReady = remainingMs === 0;
  const needsTarget = Boolean(skill?.requiresTarget && !hasSelectedTarget);
  const disabled = !skill || !player?.isAlive || !isReady;
  const cooldownProgress = skill ? Math.min(1, remainingMs / skill.cooldownMs) : 0;
  const targetState = needsTarget ? 'needs-target' : skill?.requiresTarget ? 'has-target' : 'self-cast';
  return (
    <button
      type="button"
      className={`skill-button skill-button--${targetState}${remainingMs > 0 ? ' skill-button--cooling' : ''}${compact ? ' skill-button--compact' : ''}`}
      disabled={disabled}
      aria-label={skill ? `Cast ${skill.name}` : 'Empty skill slot'}
      aria-keyshortcuts={ariaHotkeys}
      style={{ '--cooldown-progress': cooldownProgress } as CSSProperties}
      onClick={() => skill && onCastSkill(skill.id)}
      onContextMenu={(e) => {
        if (!skill) return;
        e.preventDefault();
        openWikiAt('skills', skill.id);
      }}
      {...(tooltipHandlers ?? {})}
    >
      <span className="skill-button__hotkey">{hotkey}</span>
      <strong className="skill-button__name">{skill?.name ?? 'Empty'}</strong>
      <small className="skill-button__footer">{formatSkillFooter(skill?.manaCost, remainingMs)}</small>
      {remainingMs > 0 && (
        <span className="skill-button__cooldown" aria-hidden="true">
          {formatCooldown(remainingMs)}
        </span>
      )}
      {needsTarget && skill && (
        <span className="skill-button__hint" aria-hidden="true">Pick target</span>
      )}
    </button>
  );
}

function formatSkillFooter(manaCost: number | undefined, remainingMs: number): string {
  if (!manaCost) return '-';
  if (remainingMs > 0) return `${(remainingMs / 1_000).toFixed(1)}s`;
  return `${manaCost} MP`;
}

function formatCooldown(remainingMs: number): string {
  if (remainingMs >= 10_000) return `${Math.ceil(remainingMs / 1_000)}`;
  return `${(remainingMs / 1_000).toFixed(1)}`;
}
