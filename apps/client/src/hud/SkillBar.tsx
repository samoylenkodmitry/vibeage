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
import { ITEMS } from '../../../../packages/content/items';
import { INVENTORY_DRAG_MIME } from './InventorySlotButton';
import { ItemShortcutButton } from './ItemShortcutButton';
import { useDraggablePanel } from './useDraggablePanel';
import { useActionBarDrag } from './actionBarDrag';
import { useHasMousePointer } from './useHasMousePointer';
import {
  ACTION_BAR_DRAG_MIME,
  ACTION_DRAG_MIME,
  SKILL_DRAG_MIME,
  findBagSlotForItem,
  type ActionRef,
} from './useActionBar';

/** A built-in UI action (Move/Pickup) bound to a bar slot. Skills and items
 *  resolve themselves; these need their label/hotkey/handler from GameHud. */
export type BuiltinBarAction = { label: string; hotkey: string; disabled: boolean; onInvoke: () => void };

type SkillBarProps = {
  player: PlayerEntity | null;
  hasSelectedTarget: boolean;
  onCastSkill: (skillId: SkillId) => void;
  inventory: InventorySlot[];
  onUseItem: (slotIndex: number) => void;
  /** Unified action-bar layout: skill | item | action | empty per slot. */
  actionBar: (ActionRef | null)[];
  onSetSlot: (slotIndex: number, ref: ActionRef) => void;
  onSwapSlot: (from: number, to: number) => void;
  onClearSlot: (slotIndex: number) => void;
  /** Metadata + handlers for `kind:'action'` slots, keyed by action id. */
  builtinActions: Record<string, BuiltinBarAction>;
  /** When locked the bar is "frozen": no drag onto/off/within it, taps
   *  only. Mainly a touch affordance against accidental rearranging. */
  locked: boolean;
  onToggleLock: () => void;
};

export function SkillBar(props: SkillBarProps) {
  const { player, actionBar, locked, onToggleLock } = props;
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
    <section ref={dragRef} className={`skill-bar${locked ? ' skill-bar--locked' : ''}`} aria-label="Skills">
      <span className="drag-grip skill-bar-grip" aria-hidden="true" title="Drag to move">⠿</span>
      <button
        type="button"
        className="skill-bar-lock"
        aria-pressed={locked}
        aria-label={locked ? 'Unlock action bar (allow rearranging)' : 'Lock action bar (freeze layout)'}
        title={locked ? 'Bar locked — tap to allow dragging' : 'Bar unlocked — tap to freeze layout'}
        onClick={onToggleLock}
      >
        {locked ? 'Locked' : 'Unlocked'}
      </button>
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

type SlotDragCbs = {
  onSetSlot: (slotIndex: number, ref: ActionRef) => void;
  onSwapSlot: (from: number, to: number) => void;
  onClearSlot: (slotIndex: number) => void;
};

/** HTML5 (mouse) drag handlers for one bar slot: accept skill/action ('copy')
 *  and bar-reorder/bag ('move') drops, be a reorder source, and remove the
 *  slot when dragged out of the bar (dropEffect 'none'). */
function makeSlotDragHandlers(slotIndex: number, hasContent: boolean, locked: boolean, cbs: SlotDragCbs) {
  const onDragOver = (e: React.DragEvent) => {
    if (locked) return;
    const types = e.dataTransfer.types;
    // dropEffect must match the source's effectAllowed or the browser refuses
    // the drop. Skill/action drags are 'copy'; bar reorder and bag items 'move'.
    if (types.includes(SKILL_DRAG_MIME) || types.includes(ACTION_DRAG_MIME)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    } else if (types.includes(ACTION_BAR_DRAG_MIME) || types.includes(INVENTORY_DRAG_MIME)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
    }
  };
  const onDrop = (e: React.DragEvent) => {
    if (locked) return;
    const reorder = e.dataTransfer.getData(ACTION_BAR_DRAG_MIME);
    const item = e.dataTransfer.getData(INVENTORY_DRAG_MIME);
    const skill = e.dataTransfer.getData(SKILL_DRAG_MIME);
    const action = e.dataTransfer.getData(ACTION_DRAG_MIME);
    if (!reorder && !item && !skill && !action) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      if (reorder) {
        const { fromSlot } = JSON.parse(reorder) as { fromSlot?: number };
        if (typeof fromSlot === 'number') cbs.onSwapSlot(fromSlot, slotIndex);
      } else if (skill) {
        const { skillId } = JSON.parse(skill) as { skillId?: string };
        if (typeof skillId === 'string') cbs.onSetSlot(slotIndex, { kind: 'skill', id: skillId as SkillId });
      } else if (action) {
        const { actionId } = JSON.parse(action) as { actionId?: string };
        if (typeof actionId === 'string') cbs.onSetSlot(slotIndex, { kind: 'action', id: actionId });
      } else {
        const { itemId } = JSON.parse(item) as { itemId?: string };
        if (typeof itemId === 'string') cbs.onSetSlot(slotIndex, { kind: 'item', id: itemId });
      }
    } catch { /* malformed payload */ }
  };
  const onDragStart = (e: React.DragEvent) => {
    if (locked || !hasContent) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(ACTION_BAR_DRAG_MIME, JSON.stringify({ fromSlot: slotIndex }));
  };
  const onDragEnd = (e: React.DragEvent) => {
    // Dropped outside any slot (no target accepted it) → remove from the bar.
    if (!locked && e.dataTransfer.dropEffect === 'none') cbs.onClearSlot(slotIndex);
  };
  return { onDragOver, onDrop, onDragStart, onDragEnd };
}

function SkillBarSlot({
  slotIndex, slot, hotkey, compact, player, now, hasSelectedTarget, onCastSkill,
  inventory, onUseItem, onSetSlot, onSwapSlot, onClearSlot, tooltip, locked, builtinActions,
}: SkillBarSlotProps) {
  const aria = getSkillSlotAriaHotkeys(slotIndex);
  const { beginDrag, consumeDragClick } = useActionBarDrag();
  const hasMouse = useHasMousePointer();
  // A skill ref is only live if the player still knows that skill.
  const knownSkill = slot?.kind === 'skill' && (player?.unlockedSkills?.includes(slot.id) ?? false)
    ? slot.id : null;
  const dragLabel = slotDragLabel(slot, slotIndex, builtinActions);
  const drag = makeSlotDragHandlers(slotIndex, Boolean(slot), locked, { onSetSlot, onSwapSlot, onClearSlot });
  return (
    <div
      className="skill-bar-slot"
      data-bar-slot={slotIndex}
      draggable={Boolean(slot) && !locked && hasMouse}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
      onPointerDown={(e) => {
        if (slot) beginDrag({ kind: 'reorder', fromSlot: slotIndex }, e, dragLabel);
      }}
      onClickCapture={(e) => {
        // A touch drag ends in a click on the inner button; swallow it so
        // a rearrange doesn't also cast/use the slot's action.
        if (consumeDragClick()) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
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
      ) : slot?.kind === 'action' ? (
        <BarActionButton
          action={builtinActions[slot.id]} hotkey={hotkey} ariaHotkeys={aria} compact={compact}
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

function slotDragLabel(
  slot: ActionRef | null,
  slotIndex: number,
  builtinActions: Record<string, BuiltinBarAction>,
): string {
  if (!slot) return `Slot ${slotIndex + 1}`;
  if (slot.kind === 'item') return ITEMS[slot.id]?.name ?? slot.id;
  if (slot.kind === 'action') return builtinActions[slot.id]?.label ?? slot.id;
  return SKILLS[slot.id]?.name ?? `Slot ${slotIndex + 1}`;
}

/** A bar slot holding a built-in UI action (Move/Pickup). Reuses skill-button
 *  chrome; tap invokes the action's handler unless it's currently disabled. */
function BarActionButton({
  action, hotkey, ariaHotkeys, compact,
}: {
  action: BuiltinBarAction | undefined;
  hotkey: string;
  ariaHotkeys: string;
  compact?: boolean;
}) {
  const className = `skill-button skill-button--self-cast${compact ? ' skill-button--compact' : ''}`;
  if (!action) {
    return (
      <button type="button" className={className} disabled aria-label="Empty slot">
        <span className="skill-button__hotkey">{hotkey}</span>
        <strong className="skill-button__name">Empty</strong>
      </button>
    );
  }
  return (
    <button
      type="button"
      className={className}
      disabled={action.disabled}
      aria-label={`${action.label} action`}
      aria-keyshortcuts={ariaHotkeys}
      onClick={action.onInvoke}
    >
      <span className="skill-button__hotkey">{hotkey}</span>
      <strong className="skill-button__name">{action.label}</strong>
      <small className="skill-button__footer">{action.hotkey}</small>
    </button>
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
