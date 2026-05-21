import { getStarterSkillForClass, type CharacterClass } from '../../../../packages/content/classes';
import { SKILLS } from '../../../../packages/content/skills';
import { BASIC_ATTACK_HOTKEY, SKILL_BAR_HOTKEYS } from '../skillShortcuts';
import type { GameClientState } from '../gameTypes';
import { useDismissibleHint } from './useDismissibleHint';

/**
 * §49/M2 — one-time skill-use hint. Renders the moment the
 * player has a target selected but hasn't yet defeated anyone —
 * the "you have a goblin in front of you, here's how to hit it"
 * prompt that bridges between the targeting hint (#307) and
 * actually pressing a key.
 *
 * Names the player's class starter skill so the hint reads
 * "Press 1 to cast Fireball" / "Press 1 to cast Slash" — the
 * concrete number+name rather than a generic "press a skill".
 * Falls back to the basic-attack hotkey when the class has no
 * resolvable starter skill.
 */
type SkillUseHintProps = {
  state: GameClientState;
};

export function SkillUseHint({ state }: SkillUseHintProps) {
  const { dismissed, dismiss } = useDismissibleHint('skill-use');
  const hint = pickSkillUseHint(state);
  if (dismissed || !hint) return null;
  return (
    <section className="skill-use-hint" role="status" aria-live="polite">
      <strong>Cast {hint.skillName}</strong>
      <small>Press <kbd>{hint.hotkey}</kbd> to {hint.action.toLowerCase()}.</small>
      <button type="button" className="hint-dismiss" aria-label="Dismiss hint" onClick={dismiss}>×</button>
    </section>
  );
}

export type SkillUseHintCopy = {
  skillName: string;
  hotkey: string;
  action: string;
};

/**
 * Visibility + copy resolver. Returns null when the hint should
 * not render; returns the skill/hotkey/action labels otherwise.
 * Exported for unit testing — keeps the predicate honest without
 * rendering React.
 */
export function pickSkillUseHint(state: GameClientState): SkillUseHintCopy | null {
  const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
  if (!player?.isAlive) return null;
  if (state.starterProgress?.isComplete) return null;
  if ((state.starterProgress?.defeatedEnemies ?? 0) > 0) return null;
  // No target selected → the targeting hint (#307) covers this
  // step; deferring keeps the two hints from stacking.
  if (!state.selectedTargetId) return null;
  // Find the player's class starter skill. Falls back to basic
  // attack if the class has no level-1 active skill on file.
  const className = player.className as CharacterClass;
  const starterId = getStarterSkillForClass(className);
  if (starterId) {
    const skill = SKILLS[starterId];
    if (skill) {
      return { skillName: skill.name, hotkey: SKILL_BAR_HOTKEYS[0] ?? '1', action: 'cast it' };
    }
  }
  return { skillName: 'Basic Attack', hotkey: BASIC_ATTACK_HOTKEY, action: 'swing' };
}
