import { useMemo, type CSSProperties } from 'react';
import { SKILLS, type SkillId } from '../../../../packages/content/skills';
import type { PlayerEntity } from '../gameTypes';
import {
  getHotkeySkill,
  getSkillSlotAriaHotkeys,
  SKILL_BAR_HOTKEYS,
  SKILL_BAR_SLOT_COUNT,
} from '../skillShortcuts';
import { SkillTooltip } from './SkillTooltip';
import { useTooltipTrigger } from './useTooltipTrigger';

type SkillBarProps = {
  player: PlayerEntity | null;
  now: number;
  hasSelectedTarget: boolean;
  onCastSkill: (skillId: SkillId) => void;
};

export function SkillBar({ player, now, hasSelectedTarget, onCastSkill }: SkillBarProps) {
  const slots = useMemo(() => {
    return Array.from({ length: SKILL_BAR_SLOT_COUNT }, (_, index) => getHotkeySkill(player, index));
  }, [player]);
  const tooltip = useTooltipTrigger<SkillId>();

  return (
    <section className="skill-bar" aria-label="Skills">
      {slots.map((skillId, index) => (
        <SkillButton
          key={`${index}:${skillId ?? 'empty'}`}
          skillId={skillId}
          hotkey={SKILL_BAR_HOTKEYS[index] ?? ''}
          ariaHotkeys={getSkillSlotAriaHotkeys(index)}
          player={player}
          now={now}
          hasSelectedTarget={hasSelectedTarget}
          onCastSkill={onCastSkill}
          tooltipHandlers={skillId ? tooltip.triggerProps(skillId) : undefined}
        />
      ))}
      {tooltip.info && (
        <SkillTooltip
          skillId={tooltip.info.payload}
          clientX={tooltip.info.clientX}
          clientY={tooltip.info.clientY}
        />
      )}
    </section>
  );
}

function SkillButton({
  skillId,
  hotkey,
  ariaHotkeys,
  player,
  now,
  hasSelectedTarget,
  onCastSkill,
  tooltipHandlers,
}: {
  skillId: SkillId | null;
  hotkey: string;
  ariaHotkeys: string;
  player: PlayerEntity | null;
  now: number;
  hasSelectedTarget: boolean;
  onCastSkill: (skillId: SkillId) => void;
  tooltipHandlers?: React.HTMLAttributes<HTMLButtonElement>;
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
      className={`skill-button skill-button--${targetState}${remainingMs > 0 ? ' skill-button--cooling' : ''}`}
      disabled={disabled}
      aria-label={skill ? `Cast ${skill.name}` : 'Empty skill slot'}
      aria-keyshortcuts={ariaHotkeys}
      style={{ '--cooldown-progress': cooldownProgress } as CSSProperties}
      onClick={() => skill && onCastSkill(skill.id)}
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
        <span className="skill-button__hint" aria-hidden="true">
          Pick target
        </span>
      )}
    </button>
  );
}

function formatSkillFooter(manaCost: number | undefined, remainingMs: number): string {
  if (!manaCost) {
    return '-';
  }

  if (remainingMs > 0) {
    return `${(remainingMs / 1_000).toFixed(1)}s`;
  }

  return `${manaCost} MP`;
}

function formatCooldown(remainingMs: number): string {
  if (remainingMs >= 10_000) {
    return `${Math.ceil(remainingMs / 1_000)}`;
  }
  return `${(remainingMs / 1_000).toFixed(1)}`;
}
