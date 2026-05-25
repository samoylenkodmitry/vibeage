import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SKILLS, type SkillId } from '../../../../packages/content/skills';
import { useNow } from './useNow';
import type { PlayerEntity } from '../gameTypes';
import type { InventorySlot } from '../../../../packages/protocol/messages';
import {
  getSkillSlotAriaHotkeys,
  SKILL_BAR_HOTKEYS,
  SKILL_BAR_ROW_COUNT,
  SKILL_BAR_SECONDARY_HOTKEYS,
} from '../skillShortcuts';
import { SkillTooltip } from './SkillTooltip';
import { useTooltipTrigger } from './useTooltipTrigger';
import { openWikiAt } from './wikiNavBus';
import { INVENTORY_DRAG_MIME } from './InventorySlotButton';
import { ItemShortcutButton } from './ItemShortcutButton';
import { useDraggablePanel } from './useDraggablePanel';
import {
  ACTION_BAR_DRAG_MIME,
  SKILL_DRAG_MIME,
  findBagSlotForItem,
  type ActionRef,
} from './useActionBar';

type SkillBarProps = {
  player: PlayerEntity | null;
  hasSelectedTarget: boolean;
  onCastSkill: (skillId: SkillId) => void;
  inventory: InventorySlot[];
  onUseItem: (slotIndex: number) => void;
  /** Unified action-bar layout (length 20): skill | item | empty per slot. */
  actionBar: (ActionRef | null)[];
  onSetSlot: (slotIndex: number, ref: ActionRef) => void;
  onSwapSlot: (from: number, to: number) => void;
  onClearSlot: (slotIndex: number) => void;
};

export function SkillBar(props: SkillBarProps) {
  const { player, actionBar } = props;
  // Own the cooldown clock here instead of receiving it as a prop from
  // GameHud — a useNow up there forced the entire HUD to re-render
  // 10×/sec. The bar is small + always visible, so ticking it locally
  // is far cheaper than reconciling the whole tree.
  const now = useNow(100);
  const tooltip = useTooltipTrigger<SkillId>();
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const hasSecondaryContent = actionBar.slice(SKILL_BAR_ROW_COUNT).some(Boolean);
  const dragRef = useDraggablePanel<HTMLElement>('skill-bar', {
    handleSelector: '.drag-grip',
    baseTransform: 'translateX(-50%)',
  });

  return (
    <section ref={dragRef} className="skill-bar" aria-label="Skills">
      <span className="drag-grip skill-bar-grip" aria-hidden="true" title="Drag to move">⠿</span>
      <div className="skill-bar-row">
        {Array.from({ length: SKILL_BAR_ROW_COUNT }, (_, index) => (
          <SkillBarSlot
            key={index} slotIndex={index} slot={actionBar[index] ?? null}
            hotkey={SKILL_BAR_HOTKEYS[index] ?? ''} tooltip={tooltip} now={now} {...props}
          />
        ))}
      </div>
      {(hasSecondaryContent || secondaryOpen) && (
        <div className="skill-bar-row skill-bar-row--secondary">
          {Array.from({ length: SKILL_BAR_SECONDARY_HOTKEYS.length }, (_, index) => {
            const slotIndex = SKILL_BAR_ROW_COUNT + index;
            return (
              <SkillBarSlot
                key={slotIndex} slotIndex={slotIndex} slot={actionBar[slotIndex] ?? null}
                hotkey={SKILL_BAR_SECONDARY_HOTKEYS[index] ?? ''} compact tooltip={tooltip} now={now} {...props}
              />
            );
          })}
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
  slot: ActionRef | null;
  hotkey: string;
  tooltip: TooltipApi;
  now: number;
  compact?: boolean;
};

function SkillBarSlot({
  slotIndex, slot, hotkey, compact, player, now, hasSelectedTarget, onCastSkill,
  inventory, onUseItem, onSetSlot, onSwapSlot, onClearSlot, tooltip,
}: SkillBarSlotProps) {
  const aria = getSkillSlotAriaHotkeys(slotIndex);
  // A skill ref is only live if the player still knows that skill.
  const knownSkill = slot?.kind === 'skill' && (player?.unlockedSkills?.includes(slot.id) ?? false)
    ? slot.id : null;
  const ACCEPTED = [ACTION_BAR_DRAG_MIME, INVENTORY_DRAG_MIME, SKILL_DRAG_MIME];
  const onDragOver = (e: React.DragEvent) => {
    if (ACCEPTED.some((mime) => e.dataTransfer.types.includes(mime))) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const reorder = e.dataTransfer.getData(ACTION_BAR_DRAG_MIME);
    const item = e.dataTransfer.getData(INVENTORY_DRAG_MIME);
    const skill = e.dataTransfer.getData(SKILL_DRAG_MIME);
    if (!reorder && !item && !skill) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      if (reorder) {
        const { fromSlot } = JSON.parse(reorder) as { fromSlot?: number };
        if (typeof fromSlot === 'number') onSwapSlot(fromSlot, slotIndex);
      } else if (skill) {
        const { skillId } = JSON.parse(skill) as { skillId?: string };
        if (typeof skillId === 'string') onSetSlot(slotIndex, { kind: 'skill', id: skillId as SkillId });
      } else {
        const { itemId } = JSON.parse(item) as { itemId?: string };
        if (typeof itemId === 'string') onSetSlot(slotIndex, { kind: 'item', id: itemId });
      }
    } catch { /* malformed payload */ }
  };
  const onDragStart = (e: React.DragEvent) => {
    if (!slot) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(ACTION_BAR_DRAG_MIME, JSON.stringify({ fromSlot: slotIndex }));
  };
  return (
    <div
      className="skill-bar-slot"
      draggable={Boolean(slot)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {slot?.kind === 'item' ? (
        <ItemShortcutButton
          itemId={slot.id} hotkey={hotkey} ariaHotkeys={aria}
          count={inventory.filter((s) => s.itemId === slot.id).reduce((n, s) => n + s.quantity, 0)}
          onUse={() => {
            const idx = findBagSlotForItem(inventory, slot.id);
            if (idx !== null) onUseItem(idx);
          }}
          onClear={() => onClearSlot(slotIndex)} compact={compact}
        />
      ) : (
        <SkillButton
          skillId={knownSkill}
          hotkey={hotkey} ariaHotkeys={aria}
          player={player} now={now} hasSelectedTarget={hasSelectedTarget}
          onCastSkill={onCastSkill}
          tooltipHandlers={knownSkill ? tooltip.triggerProps(knownSkill) : undefined}
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
  // Pulse the slot for ~600ms whenever a previously-cooling skill
  // returns to ready. Useful peripheral signal in a rotation —
  // a CD that just expired is the easiest one to forget about.
  // The first sample after mount is silent so a freshly-bound slot
  // doesn't pop just because it loaded already-ready.
  const wasCoolingRef = useRef(remainingMs > 0);
  const [readyPulseKey, setReadyPulseKey] = useState(0);
  useEffect(() => {
    if (wasCoolingRef.current && remainingMs === 0 && skill) {
      setReadyPulseKey((k) => k + 1);
    }
    wasCoolingRef.current = remainingMs > 0;
  }, [remainingMs, skill]);
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
      {readyPulseKey > 0 && (
        <span
          key={`ready-${readyPulseKey}`}
          className="skill-button__ready-pulse"
          aria-hidden="true"
        />
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
