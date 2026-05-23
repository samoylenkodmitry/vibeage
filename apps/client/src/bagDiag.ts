/**
 * Diagnostic logging for the bag / pickup / long-press paths. Single
 * entry point so the call sites stay tidy and we can flip the whole
 * channel off (or send to an in-game console) without grepping for
 * console.log scattered across the codebase.
 *
 * All output is prefixed with [BAGDIAG] so users can grep DevTools.
 */
export function logBagDiag(event: string, payload: Record<string, unknown>): void {
  console.log(`[BAGDIAG] ${event}`, payload);
}
