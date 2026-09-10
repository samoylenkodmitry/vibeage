import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeLocalActionFeedback, type LocalActionFeedback } from './localActionFeedback';

const FLASH_TTL_MS = 1700;

/**
 * A brief, prominent flash just above the action bar when an action can't fire
 * (out of range, no target, no mana, on cooldown). The same copy also lands in
 * the combat log, but a new player who presses a skill that does nothing needs
 * feedback where they're looking — not in a panel they may not have open.
 *
 * Two sources feed it, deliberately sharing one surface: server rejections
 * arrive as the `feedback` prop (reducer → CommandRejected), and refusals the
 * HUD itself makes — cooldown, empty slot, nothing to pick up — arrive on the
 * local bus, because those taps never reach the server to be rejected.
 *
 * Visibility is driven purely by the feedback CHANGING (new `at`), then hidden
 * by a timer — never by comparing `at` to `Date.now()`, which would be fragile
 * to clock skew. The `at` value only keys the element so the fade replays.
 */
export function ActionFeedbackFlash({ feedback }: { feedback: { text: string; at: number } | null }) {
  const [shown, setShown] = useState<LocalActionFeedback | null>(null);
  const lastAt = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: LocalActionFeedback) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShown(next);
    timerRef.current = setTimeout(() => setShown(null), FLASH_TTL_MS);
  }, []);

  useEffect(() => {
    if (!feedback || feedback.at === lastAt.current) return;
    lastAt.current = feedback.at;
    show(feedback);
  }, [feedback, show]);

  useEffect(() => subscribeLocalActionFeedback(show), [show]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (!shown) return null;
  return (
    <div className="action-feedback-flash" role="status" aria-live="assertive" key={shown.at}>
      {shown.text}
    </div>
  );
}
