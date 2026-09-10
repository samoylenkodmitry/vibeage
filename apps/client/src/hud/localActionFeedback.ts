/**
 * HUD-local "why nothing happened" bus.
 *
 * The server answers every refused command with CommandRejected, and the
 * reducer routes that into `state.actionFeedback` — the flash above the action
 * bar. But a tap the CLIENT refuses never reaches the server, so there is no
 * rejection to route: a skill still on cooldown, a slot bound to nothing, a
 * Pickup with no loot around. Those taps used to be swallowed in silence,
 * which is the worst bug class in this project.
 *
 * Rather than invent a second feedback surface, HUD-local refusals publish
 * here and `ActionFeedbackFlash` renders them in exactly the same place, with
 * the same copy voice, as the server's rejections.
 */

export type LocalActionFeedback = { text: string; at: number };

type Listener = (feedback: LocalActionFeedback) => void;

const listeners = new Set<Listener>();
let lastAt = 0;

export function subscribeLocalActionFeedback(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Flash `text` above the action bar. Repeating the same refusal re-flashes
 * (a player who taps a cooling skill twice wants to see it twice), so `at` is
 * forced to strictly increase even inside a single millisecond — the flash
 * keys its fade animation off that value.
 */
export function publishLocalActionFeedback(text: string): LocalActionFeedback {
  const at = Math.max(Date.now(), lastAt + 1);
  lastAt = at;
  const feedback = { text, at };
  for (const listener of [...listeners]) listener(feedback);
  return feedback;
}

/** Test seam — drops every subscriber so specs don't leak into each other. */
export function resetLocalActionFeedback(): void {
  listeners.clear();
  lastAt = 0;
}
