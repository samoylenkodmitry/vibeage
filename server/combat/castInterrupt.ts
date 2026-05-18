import { CastState as CastStateEnum } from '../../packages/protocol/messages.js';
import { SKILLS } from '../../packages/content/skills.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { debug, LOG_CATEGORIES } from '../logger.js';
import { emitPlayerUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';
import type { ActiveCastStore } from './skillSystem.js';

/**
 * Cast interruption gate. A blocking cast (skill.isBlocking !== false)
 * locks the player out of other actions while the cast bar runs:
 *
 *   - `tryInterruptForNewAction` returns:
 *     * 'allow'      — no active blocking cast; the new action proceeds.
 *     * 'block'      — there is an active blocking + non-interruptable cast;
 *                       the new action must be silently dropped.
 *     * 'interrupted' — there is an active blocking + interruptable cast;
 *                       the existing cast was cancelled cleanly (mana
 *                       refunded, cooldown NOT applied, castingSkill
 *                       cleared, broadcast). The new action proceeds.
 *
 * Used by handleCastReq (before starting a new cast) and applyMoveIntent
 * (before mutating movement) — both block the player out of the
 * blocking cast or interrupt it depending on the skill's flags.
 */
export type InterruptResult = 'allow' | 'block' | 'interrupted';

export function tryInterruptForNewAction(
  player: PlayerState,
  activeCasts: ActiveCastStore,
  outbound: OutboundEventSink,
  reason: 'newCast' | 'movement' | 'other',
): InterruptResult {
  const cast = Object.values(activeCasts).find(
    (c) => c.casterId === player.id && c.state === CastStateEnum.Casting,
  );
  if (!cast) return 'allow';
  const skill = SKILLS[cast.skillId];
  // Default-on: a skill without isBlocking declared blocks while
  // casting. Matches the user spec: "all casting skills should block
  // any other player action … until skill is casted".
  const blocking = skill?.isBlocking !== false;
  if (!blocking) return 'allow';
  // Default-on: a blocking cast is interruptable unless it
  // explicitly opted out. Interrupting refunds the mana that was
  // charged when the cast started AND wipes the just-set cooldown
  // entry so the player can re-cast immediately.
  const interruptable = skill?.isInterruptable !== false;
  if (!interruptable) return 'block';
  // Refund mana + remove cooldown.
  if (skill?.manaCost) {
    player.mana = Math.min((player.maxMana ?? player.mana), player.mana + skill.manaCost);
  }
  if (player.skillCooldownEndTs?.[cast.skillId]) {
    const next = { ...(player.skillCooldownEndTs ?? {}) };
    delete next[cast.skillId];
    player.skillCooldownEndTs = next;
  }
  player.castingSkill = null;
  player.castingProgressMs = 0;
  delete activeCasts[cast.castId];
  debug(LOG_CATEGORIES.COMBAT, `Cast ${cast.castId} interrupted (${reason}); player ${player.id}`);
  emitPlayerUpdated(outbound, {
    id: player.id,
    castingSkill: null,
    castingProgressMs: 0,
    mana: player.mana,
    skillCooldownEndTs: player.skillCooldownEndTs,
  });
  return 'interrupted';
}
