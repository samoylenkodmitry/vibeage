import { CastState as CastStateEnum } from '../../packages/protocol/messages.js';
import { SKILLS, type SkillKind } from '../../packages/content/skills.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import { debug, LOG_CATEGORIES } from '../logger.js';
import { emitPlayerUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';
import type { ActiveCastStore } from './skillSystem.js';

/**
 * PR S — interrupt resistance. Cast is "sticky" against incidental
 * input based on the caster's relevant attribute:
 *   - physical → STR (knight in plate keeps swinging through bumps)
 *   - magical  → INT (mage's focus holds the spell)
 *   - utility  → max(WIT, MEN) (utility skills lean on mental tenacity)
 *
 * Cap at 85% so casts are never literally uninterruptible (still beats
 * the player-skill `isInterruptable: false` opt-out for that). The
 * roll only applies when the skill is otherwise interruptable.
 */
const RESIST_PER_POINT = 0.012;
const RESIST_CAP = 0.85;

function relevantStatFor(kind: SkillKind | undefined, player: PlayerState): number {
  const s = player.stats;
  if (!s) return 0;
  if (kind === 'physical') return s.str ?? 0;
  if (kind === 'magical') return s.int ?? 0;
  return Math.max(s.wit ?? 0, s.men ?? 0);
}

function resistChance(kind: SkillKind | undefined, player: PlayerState): number {
  const stat = relevantStatFor(kind, player);
  return Math.min(RESIST_CAP, Math.max(0, stat * RESIST_PER_POINT));
}

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
  rng: () => number,
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

  // PR S — stat-based resist roll. High STR knights keep swinging
  // through incidental input; high INT mages keep concentration.
  // The new action is dropped (block) on a successful resist; cast
  // continues. Movement resists are checked here so a stray touch
  // doesn't wipe a slow cast.
  const resist = resistChance(skill?.kind, player);
  if (resist > 0 && rng() < resist) {
    debug(LOG_CATEGORIES.COMBAT, `Cast ${cast.castId} resisted ${reason} interrupt (player ${player.id}, p=${resist.toFixed(2)})`);
    return 'block';
  }
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
