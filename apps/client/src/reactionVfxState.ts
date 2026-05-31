import { REACTION_VFX, type ReactionVfxFlavor } from '../../../packages/content/skillReactions';
import type { ServerMessage } from '../../../packages/protocol/messages';
import type { GameClientState } from './gameTypes';
import { normalizeVec3 } from './vec3';
import { addVisualEvent } from './visualEventState';

/** A combo reaction fired (server-authoritative) — spawn a flavored burst at the
 *  target using the reaction's palette colours. */
export function applyReactionTriggeredVisualState(
  state: GameClientState,
  message: ServerMessage & { type: 'ReactionTriggered' },
  now: number,
): GameClientState {
  const palette = REACTION_VFX[message.flavor as ReactionVfxFlavor] ?? REACTION_VFX.impact;
  return addVisualEvent(state, {
    kind: 'reaction',
    position: normalizeVec3(message.position),
    color: palette.color,
    accent: palette.accent,
    createdAt: now,
  });
}
