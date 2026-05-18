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
  | 'effects' | 'quests' | 'stats' | 'mobs' | 'bosses' | 'recipes';

type WikiNavEvent = { tab: WikiTabId; id: string };
type Handler = (event: WikiNavEvent) => void;
type Opener = () => void;

const handlers: Set<Handler> = new Set();
const openers: Set<Opener> = new Set();

export function subscribeWikiNav(handler: Handler): () => void {
  handlers.add(handler);
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
  for (const h of handlers) {
    try { h({ tab, id }); } catch { /* ignore subscriber errors */ }
  }
}
