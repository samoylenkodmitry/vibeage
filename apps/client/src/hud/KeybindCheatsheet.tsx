import { useEffect, useState } from 'react';
import { isEditableTarget } from '../skillShortcuts';
import { subscribeKeybindOpen } from './keybindBus';

type Row = { key: string; label: string };

const GROUPS: readonly { title: string; rows: readonly Row[] }[] = [
  {
    title: 'Combat',
    rows: [
      { key: '1 — 0', label: 'Skill bar (primary row)' },
      { key: 'Q W E R T Y U I O P', label: 'Skill bar (secondary row)' },
      { key: 'A', label: 'Basic attack' },
      { key: 'Tab', label: 'Cycle to nearest enemy' },
    ],
  },
  {
    title: 'World',
    rows: [
      { key: 'F', label: 'Pick up nearest loot' },
      { key: 'M', label: 'Move to map marker' },
      { key: 'R', label: 'Respawn (on death overlay)' },
    ],
  },
  {
    title: 'UI',
    rows: [
      { key: 'H / ?', label: 'Toggle this cheatsheet' },
      { key: 'Esc', label: 'Close panels / dialogs' },
    ],
  },
];

/**
 * Tiny help overlay listing the active keybinds. Toggled with
 * 'H' or '?' (Shift+/) — both common conventions for help.
 * Esc dismisses. Suppressed while the user is typing in an input
 * field so chatting doesn't accidentally open it.
 *
 * Lives at the HUD layer so it floats above the canvas; no game
 * state plumbing required — purely local toggle.
 */
export function KeybindCheatsheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (open && e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (e.code === 'KeyH' || e.key === '?') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Bus subscription so the visible '?' button (or any other
  // surface) can open the same overlay without lifting state.
  useEffect(() => subscribeKeybindOpen(() => setOpen(true)), []);

  if (!open) return null;
  return (
    <section className="keybind-cheatsheet" role="dialog" aria-modal="false" aria-label="Keybinds">
      <header className="keybind-cheatsheet__header">
        <strong>Keybinds</strong>
        <button
          type="button"
          className="keybind-cheatsheet__close"
          aria-label="Close keybind cheatsheet"
          onClick={() => setOpen(false)}
        >
          ×
        </button>
      </header>
      {GROUPS.map((group) => (
        <div key={group.title} className="keybind-cheatsheet__group">
          <h3 className="keybind-cheatsheet__group-title">{group.title}</h3>
          <dl className="keybind-cheatsheet__list">
            {group.rows.map((row) => (
              <div key={row.key} className="keybind-cheatsheet__row">
                <dt><kbd>{row.key}</kbd></dt>
                <dd>{row.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}
