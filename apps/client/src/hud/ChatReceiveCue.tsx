import { useEffect, useRef } from 'react';
import { playCue } from '../audio/cues';
import type { ChatLine } from '../gameTypes';

type ChatReceiveCueProps = {
  chatLines: readonly ChatLine[];
  myPlayerId: string | null;
};

const COOLDOWN_MS = 250;

/**
 * Plays a soft 'chat' cue whenever a new chat line arrives from
 * someone OTHER than the local player. Self-messages stay silent
 * (you already know you sent it). First sample after mount is
 * treated as baseline so a reconnect snapshot doesn't fire a
 * burst of cues for already-read messages.
 *
 * Headless — no DOM. Sibling to the other cue bridges.
 */
export function ChatReceiveCue({ chatLines, myPlayerId }: ChatReceiveCueProps) {
  const seenRef = useRef<Set<string>>(new Set(chatLines.map((line) => line.id)));
  const initializedRef = useRef(false);
  const lastCueAtRef = useRef(0);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    const now = performance.now();
    for (const line of chatLines) {
      if (seenRef.current.has(line.id)) continue;
      seenRef.current.add(line.id);
      if (line.fromId === myPlayerId) continue;
      if (now - lastCueAtRef.current < COOLDOWN_MS) continue;
      playCue('chat');
      lastCueAtRef.current = now;
    }
  }, [chatLines, myPlayerId]);

  return null;
}
