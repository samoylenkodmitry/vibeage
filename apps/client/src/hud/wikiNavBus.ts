/**
 * Lightweight pub-sub for "open the Wiki at X". Lets a panel that
 * isn't part of the HudPanels tree (PlayerPanel, SkillBar, …) fire
 * a nav request that WikiPanel listens for + jumps to. Beats
 * threading nav callbacks through every panel.
 *
 * Subscribers register a handler in useEffect; the publisher
 * triggers via openWikiAt(tab, id). The WikiPanel also opens
 * itself if currently closed.
 */
export type WikiTabId =
  | 'skills' | 'items' | 'tree' | 'classes' | 'specs' | 'races'
  | 'effects' | 'quests' | 'stats' | 'mobs' | 'bosses' | 'recipes' | 'sets';

type WikiNavEvent = { tab: WikiTabId; id: string };
type Handler = (event: WikiNavEvent) => void;
type Opener = () => void;

const handlers: Set<Handler> = new Set();
const openers: Set<Opener> = new Set();
/**
 * PR Z — stash the latest nav request so a freshly-mounted WikiPanel
 * can apply it on subscribe. Without this, calling openWikiAt while
 * the panel is closed would fire the open + nav events in one frame,
 * but the WikiPanel subscriber registers on mount (next frame), so
 * the nav event arrived before there was anyone to receive it —
 * the panel opened on its default tab and ignored the focus.
 */
let pendingNav: WikiNavEvent | null = null;

export function subscribeWikiNav(handler: Handler): () => void {
  handlers.add(handler);
  // Drain the pending nav (if any) on subscribe so a freshly-opened
  // WikiPanel lands on the right tab + row.
  if (pendingNav) {
    const ev = pendingNav;
    pendingNav = null;
    queueMicrotask(() => { try { handler(ev); } catch { /* ignore */ } });
  }
  return () => { handlers.delete(handler); };
}

export function subscribeWikiOpen(opener: Opener): () => void {
  openers.add(opener);
  return () => { openers.delete(opener); };
}

export function openWikiAt(tab: WikiTabId, id: string): void {
  // Tell the HUD to open the panel first so the nav lands somewhere
  // visible, then push the (tab, focus) through to subscribers.
  for (const o of openers) {
    try { o(); } catch { /* ignore subscriber errors */ }
  }
  if (handlers.size === 0) {
    // No WikiPanel mounted yet — stash for the upcoming subscriber.
    pendingNav = { tab, id };
    return;
  }
  for (const h of handlers) {
    try { h({ tab, id }); } catch { /* ignore subscriber errors */ }
  }
}
