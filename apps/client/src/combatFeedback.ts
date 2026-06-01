import { SKILLS } from '../../../packages/content/skills';
import type { ServerMessage } from '../../../packages/protocol/messages';
import type { CombatLineTone, GameClientState, Vec3 } from './gameTypes';
import { addVisualEvent } from './visualEventState';
import { effectLabel } from './hud/effectMeta';

// Effect types that aren't a persistent buff/debuff worth naming in the log.
const NON_STATUS_EFFECTS = new Set(['damage', 'heal', 'dispel', 'teleport', 'knockback', 'aggroReset']);

/** "Who cast it" prefix: "Your " for the local player, "<Name>'s " for anyone
 *  else we can resolve, "" when the caster is unknown (keeps old lines stable). */
export function casterPrefix(state: GameClientState, casterId?: string): string {
  if (!casterId) return '';
  if (casterId === state.myPlayerId) return 'Your ';
  const name = state.players[casterId]?.name ?? state.enemies[casterId]?.name;
  return name ? `${name}'s ` : '';
}

/** Capitalized labels of the persistent status effects a skill applies ("what changed"). */
export function appliedEffectLabels(skillId: string): string[] {
  const def = Object.prototype.hasOwnProperty.call(SKILLS, skillId) ? SKILLS[skillId as keyof typeof SKILLS] : null;
  const types = [...new Set((def?.effects ?? []).map((e) => e.type).filter((t) => !NON_STATUS_EFFECTS.has(t)))];
  return types.map((t) => { const l = effectLabel(t); return l.charAt(0).toUpperCase() + l.slice(1); });
}

/** Shape of a CombatLog message's outcome arrays — shared by the text
 *  formatter and the tone classifier so the colour matches the words. */
export type CombatLogLineParts = {
  skillId: string;
  /** Who cast it — resolved to a name for the log prefix when known. */
  casterId?: string;
  targets: string[];
  damages: number[];
  crits?: boolean[];
  misses?: boolean[];
  heals?: number[];
};

/**
 * Visual tone for a CombatLog line, derived from the same parts the
 * text formatter uses. Crit beats plain hit; a full miss reads muted;
 * a pure heal / buff gets its own hue.
 */
export function combatLogTone(parts: CombatLogLineParts): CombatLineTone {
  const { skillId, damages, crits, misses, heals } = parts;
  if (misses && misses.length > 0 && misses.every(Boolean)) return 'miss';
  const totalDamage = damages.reduce((sum, d) => sum + d, 0);
  const totalHeal = heals?.reduce((sum, h) => sum + h, 0) ?? 0;
  if (totalDamage <= 0 && totalHeal > 0) return 'heal';
  const skillDef = Object.prototype.hasOwnProperty.call(SKILLS, skillId)
    ? SKILLS[skillId as keyof typeof SKILLS] : null;
  if (totalDamage <= 0 && !(skillDef?.dmg && skillDef.dmg > 0)) return 'buff';
  return crits?.some(Boolean) ? 'crit' : 'offense';
}

export function addCombatDamageVisualEvents(
  state: GameClientState,
  message: ServerMessage & { type: 'CombatLog' },
  now: number,
): GameClientState {
  return message.targets.reduce((nextState, targetId, index) => {
    const entity = nextState.enemies[targetId] ?? nextState.players[targetId];
    if (!entity) {
      return nextState;
    }
    const position = normalizeEventPosition(entity.position);

    // Miss + damage are mutually exclusive on the server side
    // (the trace either lands or whiffs), but client just trusts
    // whichever flag is set. A miss emits its own VisualEvent kind
    // so the world overlay can render "MISS" instead of a number.
    if (message.misses?.[index]) {
      return addVisualEvent(nextState, {
        kind: 'miss',
        position,
        createdAt: now + index,
      });
    }

    const damage = message.damages[index] ?? 0;
    if (damage <= 0) {
      return nextState;
    }

    return addVisualEvent(nextState, {
      kind: 'damage',
      position,
      amount: damage,
      isCrit: message.crits?.[index] ?? false,
      createdAt: now + index,
    });
  }, state);
}

function normalizeEventPosition(position: { x: number; y?: number; z: number } | undefined): Vec3 {
  return {
    x: position?.x ?? 0,
    y: position?.y ?? 0.35,
    z: position?.z ?? 0,
  };
}
