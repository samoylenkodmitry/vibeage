import type { DirectMessageSink } from './outboundEvents.js';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';
import type { RejectableCommand } from '../../packages/protocol/commandRejections.js';

/**
 * §4/§46-slice-5 — shared helper for the structured `CommandRejected`
 * envelope. Lets every command handler announce a rejection in one
 * line instead of inlining the same `direct.send({ type: ... })`
 * payload. The `requestId` echoes the client's `clientSeq` (when
 * supplied) so the client can route the failure back to the specific
 * pending command without parsing logs.
 *
 * §52 #5 — also increments runtime counters so an operations dashboard
 * can graph rejection rates per command + per reason. A spike in
 * `commandRejected.<command>.*` is the cheapest signal that a recent
 * deploy broke a handler.
 *
 * Migration is per-command: when every handler emits this envelope,
 * the legacy *Failed messages (EquipFailed, LearnSkillFailed, …) can
 * be retired in a follow-up PR.
 */
export function sendCommandRejected(
  direct: DirectMessageSink,
  // Archwork #3 — typed registry of rejectable commands. A typo at
  // the call site is now a TS error instead of a runtime
  // "unknown rejection" with an unbounded metrics label.
  commandType: RejectableCommand,
  reason: string,
  clientSeq?: number,
  /**
   * §52 #1 — optional command-specific subject id (skill id, item id,
   * vendor id, quest id, etc.). Echoed back on the envelope so the
   * client can hang the rejection next to the right UI element.
   * Meaning is per-commandType — the helper doesn't validate.
   */
  targetId?: string,
): void {
  direct.send({
    type: 'CommandRejected',
    commandType,
    reason,
    ...(clientSeq !== undefined ? { requestId: clientSeq } : {}),
    ...(targetId !== undefined ? { targetId } : {}),
  });
  runtimeMetrics.increment(`commandRejected.${commandType}.${reason}`);
  runtimeMetrics.increment(`commandRejected.${commandType}.total`);
  runtimeMetrics.increment('commandRejected.total');
}
