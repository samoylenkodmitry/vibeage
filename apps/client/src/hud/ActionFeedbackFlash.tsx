import { useEffect, useState } from 'react';

const FLASH_TTL_MS = 1700;

/**
 * A brief, prominent flash just above the action bar when an action can't fire
 * (out of range, no target, no mana, on cooldown). The same copy also lands in
 * the combat log, but a new player who presses a skill that does nothing needs
 * feedback where they're looking — not in a panel they may not have open.
 *
 * Re-mounts on each new feedback (keyed by `at`) so the fade animation replays,
 * and a timer forces the hide even when nothing else re-renders.
 */
export function ActionFeedbackFlash({ feedback }: { feedback: { text: string; at: number } | null }) {
  const [, tick] = useState(0);
  const at = feedback?.at ?? 0;
  useEffect(() => {
    if (!feedback) return;
    const remaining = FLASH_TTL_MS - (Date.now() - at);
    if (remaining <= 0) return;
    const timer = setTimeout(() => tick((n) => n + 1), remaining + 40);
    return () => clearTimeout(timer);
  }, [feedback, at]);

  if (!feedback || Date.now() - feedback.at > FLASH_TTL_MS) return null;
  return (
    <div className="action-feedback-flash" role="status" aria-live="assertive" key={feedback.at}>
      {feedback.text}
    </div>
  );
}
