import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CombatLine } from '../gameTypes';

const STICK_TO_BOTTOM_PX = 24;

/**
 * Combat log ids are formatted as `${castId}:${nowMs}:${count}` by
 * makeCombatLineId in clientVisualState. Parse the middle segment
 * back into a wall-clock HH:MM string so each line carries a tiny
 * timestamp prefix. Falls back to '--:--' on parse failure so a
 * future id format change can't blank-screen the whole log.
 */
function formatLineTime(id: string): string {
  const parts = id.split(':');
  if (parts.length < 3) return '--:--';
  const ms = Number(parts[parts.length - 2]);
  if (!Number.isFinite(ms)) return '--:--';
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

type CombatLogPanelProps = {
  lines: readonly CombatLine[];
};

/**
 * PR MM — scrollable system chat / combat log. The visual-state
 * reducer prepends new lines (newest at index 0), so we render
 * the slice in reverse for the usual chat flow (oldest at top,
 * newest at bottom).
 *
 * Auto-scroll behaviour: stay pinned to the bottom *only* when the
 * user is already there. When they scroll up to read history, new
 * lines no longer yank them down; a small "↓" button appears so
 * they can jump back to the latest on demand.
 */
export function CombatLogPanel({ lines }: CombatLogPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [stuckToBottom, setStuckToBottom] = useState(true);

  // Track whether the user is currently at the bottom so we know
  // whether to auto-scroll on next render.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStuckToBottom(distanceFromBottom <= STICK_TO_BOTTOM_PX);
  };

  // After the lines list changes (or on first mount, since
  // stuckToBottom starts true), pin the scroll to the bottom. Layout
  // effect so the scroll happens before the browser paints.
  useLayoutEffect(() => {
    if (!stuckToBottom) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, stuckToBottom]);

  const ordered = useMemo(() => [...lines].reverse(), [lines]);

  return (
    <section className="combat-log" aria-label="Combat log">
      <div className="combat-log-scroll" ref={scrollRef} onScroll={onScroll}>
        {ordered.map((line) => (
          <span key={line.id} className="combat-log-line">
            <span className="combat-log-time">{formatLineTime(line.id)}</span>
            {line.text}
            {line.count && line.count > 1 ? ` (×${line.count})` : ''}
          </span>
        ))}
      </div>
      {!stuckToBottom && (
        <button
          type="button"
          className="combat-log-jump"
          onClick={() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
            setStuckToBottom(true);
          }}
          title="Jump to latest"
          aria-label="Jump to latest message"
        >↓</button>
      )}
    </section>
  );
}
