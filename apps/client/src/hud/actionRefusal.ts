import { SKILLS, type SkillId } from '../../../../packages/content/skills';

/**
 * Copy for the refusals the ACTION BAR itself makes, before anything reaches
 * the server. These are the taps that used to do literally nothing: the button
 * was natively `disabled`, so the browser swallowed the click and the player
 * got no hint at all.
 *
 * Everything the server owns (range, line of sight, mana, target validity)
 * still round-trips and comes back as a CommandRejected — this file must never
 * try to predict those, or the HUD starts disagreeing with the simulation.
 */

/** Shown when a player taps a slot they never filled. The bar is the first
 *  thing a new player pokes at, so the empty tile has to teach, not just sit. */
export const EMPTY_SLOT_HINT = 'Empty slot — drag a skill from Skills, or an item from your Bag.';

export type SkillSlotTapState = {
  /** Skill bound to the slot and known by the player, else null. */
  skillId: SkillId | null;
  /** The slot holds a skill ref the player has not learned (or has unlearned). */
  boundUnknownSkill: boolean;
  isAlive: boolean;
  cooldownRemainingMs: number;
};

/** Why this action-bar tap can't fire, or null when it can. */
export function skillSlotRefusal(state: SkillSlotTapState): string | null {
  if (!state.skillId) {
    if (state.boundUnknownSkill) {
      return "You haven't learned that skill yet — open Skills to unlock it.";
    }
    return EMPTY_SLOT_HINT;
  }
  if (!state.isAlive) return "You can't act while defeated — respawn first.";
  if (state.cooldownRemainingMs > 0) {
    const name = SKILLS[state.skillId]?.name ?? 'That skill';
    return `${name} is recharging — ${formatSeconds(state.cooldownRemainingMs)} left.`;
  }
  return null;
}

export type BarActionTapState = {
  isAlive: boolean;
  hasSelectedTarget: boolean;
  hasNavigationMarker: boolean;
  lootCount: number;
};

/**
 * Why the built-in Move / Pickup bar actions can't fire. They were rendered
 * `aria-disabled` with an onClick that early-returned, so a tap was silent on
 * touch — where there is no hover state to explain the greying.
 */
export function barActionRefusal(actionId: string, state: BarActionTapState): string | null {
  if (!state.isAlive) return "You can't act while defeated — respawn first.";
  if (actionId === 'move' && !state.hasSelectedTarget && !state.hasNavigationMarker) {
    return 'Nowhere to walk yet — tap a target, or drop a pin on the Map.';
  }
  if (actionId === 'pickup' && state.lootCount === 0) {
    return 'No loot nearby — defeat something first.';
  }
  return null;
}

/** One decimal below 10s, whole seconds above — matches the bar's own readout. */
function formatSeconds(ms: number): string {
  const seconds = ms / 1_000;
  return seconds >= 10 ? `${Math.ceil(seconds)}s` : `${seconds.toFixed(1)}s`;
}
