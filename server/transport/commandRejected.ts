import type { DirectMessageSink } from './outboundEvents.js';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';

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
  commandType: string,
  reason: string,
  clientSeq?: number,
): void {
  direct.send({
    type: 'CommandRejected',
    commandType,
    reason,
    ...(clientSeq !== undefined ? { requestId: clientSeq } : {}),
  });
  runtimeMetrics.increment(`commandRejected.${commandType}.${reason}`);
  runtimeMetrics.increment(`commandRejected.${commandType}.total`);
  runtimeMetrics.increment('commandRejected.total');
}
