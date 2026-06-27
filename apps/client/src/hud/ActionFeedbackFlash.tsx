import { useEffect, useRef, useState } from 'react';

const FLASH_TTL_MS = 1700;

/**
 * A brief, prominent flash just above the action bar when an action can't fire
 * (out of range, no target, no mana, on cooldown). The same copy also lands in
 * the combat log, but a new player who presses a skill that does nothing needs
 * feedback where they're looking — not in a panel they may not have open.
 *
 * Visibility is driven purely by the feedback CHANGING (new `at`), then hidden
 * by a timer — never by comparing `at` to `Date.now()`, which would be fragile
 * to clock skew. The `at` value only keys the element so the fade replays.
 */
export function ActionFeedbackFlash({ feedback }: { feedback: { text: string; at: number } | null }) {
  const [shown, setShown] = useState<{ text: string; at: number } | null>(null);
  const lastAt = useRef<number | null>(null);
  useEffect(() => {
    if (!feedback || feedback.at === lastAt.current) return;
    lastAt.current = feedback.at;
    setShown(feedback);
    const timer = setTimeout(() => setShown(null), FLASH_TTL_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  if (!shown) return null;
  return (
    <div className="action-feedback-flash" role="status" aria-live="assertive" key={shown.at}>
      {shown.text}
    </div>
  );
}
