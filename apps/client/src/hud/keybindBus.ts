/**
 * Pub-sub for "open the keybind cheatsheet". Lets the visible help
 * button (in the SFX-controls row) and the H / ? hotkey handler
 * both flip the same overlay without lifting state out of the
 * cheatsheet component. Mirrors wikiNavBus for consistency.
 */

type Opener = () => void;

const openers: Set<Opener> = new Set();

export function subscribeKeybindOpen(opener: Opener): () => void {
  openers.add(opener);
  return () => { openers.delete(opener); };
}

export function openKeybindCheatsheet(): void {
  for (const o of openers) {
    try { o(); } catch { /* ignore subscriber errors */ }
  }
}
