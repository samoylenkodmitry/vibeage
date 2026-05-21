/**
 * §4 / §52 — centralized monotonic counter the client stamps on every
 * command that accepts `clientSeq` (every rejectable command after
 * PRs #261, #323, #328-#331). Server echoes the value back as
 * `CommandRejected.requestId`, letting the client route per-request
 * UX (toast on this specific equip-failed, retry on this specific
 * cast-failed, etc.) without overloading `clientTs` as an ack key.
 *
 * One module-level counter is fine — there's a single Room per
 * client, and the server doesn't care about ordering across reloads.
 * Starting at 1 keeps `0` reserved as "unset" if any consumer ever
 * needs a sentinel.
 */
let nextSeq = 1;

export function nextClientSeq(): number {
  return nextSeq++;
}

/** Test-only — resets the counter so each spec runs from a known seed. */
export function _resetClientSeqForTests(): void {
  nextSeq = 1;
}
