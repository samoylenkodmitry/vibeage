import { SKILLS } from '../../../packages/content/skills';
import type { ServerMessage } from '../../../packages/protocol/messages';
import type { CombatLineTone, GameClientState, Vec3 } from './gameTypes';
import { addVisualEvent } from './visualEventState';

/** Shape of a CombatLog message's outcome arrays — shared by the text
 *  formatter and the tone classifier so the colour matches the words. */
export type CombatLogLineParts = {
  skillId: string;
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
