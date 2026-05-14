import { useMemo, type CSSProperties } from 'react';
import { SKILLS, type SkillId } from '../../../../packages/content/skills';
import type { PlayerEntity } from '../gameTypes';
import {
  getHotkeySkill,
  getSkillSlotAriaHotkeys,
  SKILL_BAR_HOTKEYS,
  SKILL_BAR_SLOT_COUNT,
} from '../skillShortcuts';

type SkillBarProps = {
  player: PlayerEntity | null;
  now: number;
  onCastSkill: (skillId: SkillId) => void;
};

export function SkillBar({ player, now, onCastSkill }: SkillBarProps) {
  const slots = useMemo(() => {
    return Array.from({ length: SKILL_BAR_SLOT_COUNT }, (_, index) => getHotkeySkill(player, index));
  }, [player]);

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
          onCastSkill={onCastSkill}
        />
      ))}
    </section>
  );
}

function SkillButton({
  skillId,
  hotkey,
  ariaHotkeys,
  player,
  now,
  onCastSkill,
}: {
  skillId: SkillId | null;
  hotkey: string;
  ariaHotkeys: string;
  player: PlayerEntity | null;
  now: number;
  onCastSkill: (skillId: SkillId) => void;
}) {
  const skill = skillId ? SKILLS[skillId] : null;
  const cooldownEnd = skillId ? player?.skillCooldownEndTs?.[skillId] ?? 0 : 0;
  const remainingMs = Math.max(0, cooldownEnd - now);
  const isReady = remainingMs === 0;
  const disabled = !skill || !player?.isAlive || !isReady;
  const cooldownProgress = skill ? Math.min(1, remainingMs / skill.cooldownMs) : 0;

  return (
    <button
      type="button"
      className="skill-button"
      disabled={disabled}
      aria-label={skill ? `Cast ${skill.name}` : 'Empty skill slot'}
      aria-keyshortcuts={ariaHotkeys}
      style={{ '--cooldown-progress': cooldownProgress } as CSSProperties}
      onClick={() => skill && onCastSkill(skill.id)}
    >
      <span>{hotkey}</span>
      <strong>{skill?.name ?? 'Empty'}</strong>
      <small>{formatSkillFooter(skill?.manaCost, remainingMs)}</small>
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
