import type { PanelState } from './usePanelState';
import './PanelToggleStrip.css';

/**
 * The right-hand rail of panel toggles, plus the ☰ button that collapses it.
 * Collapsed by default on phones — the always-on 9-button column otherwise
 * eats screen space and overlaps the action bar's right edge. Persisted per
 * browser (see `usePanelState`).
 */
export function PanelToggleStrip({
  panels,
  unspentSkillPoints,
  isGm,
}: {
  panels: PanelState;
  unspentSkillPoints: number;
  isGm: boolean;
}) {
  const spBadge = unspentSkillPoints > 0 ? unspentSkillPoints : null;
  const railOpen = panels.railOpen;
  // With the rail collapsed, dismissing an open window meant re-opening the
  // rail and hunting for the matching "Hide …" pill: three taps to undo one.
  // This pill puts "close what's open" in a fixed spot under the thumb.
  const showDismiss = !railOpen && panels.openWindowCount > 0;
  return (
    <aside className={`panel-toggles${railOpen ? ' panel-toggles--open' : ''}`} aria-label="Panel toggles">
      {showDismiss && (
        <button
          type="button"
          className="panel-toggle panel-dismiss-toggle"
          onClick={panels.closeAllPanels}
          aria-label={panels.openWindowCount > 1 ? 'Close open panels' : 'Close open panel'}
        >
          <span aria-hidden="true">✕</span> Close
        </button>
      )}
      <button
        type="button"
        className={`panel-toggle panel-rail-toggle${spBadge && !railOpen ? ' panel-toggle--badged' : ''}`}
        aria-expanded={railOpen}
        aria-label={railOpen ? 'Collapse menu' : 'Open menu'}
        onClick={panels.toggleRail}
      >
        {railOpen ? '✕' : '☰'}
        {spBadge && !railOpen && (
          <span className="panel-toggle__badge" aria-label={`${spBadge} unspent`}>{spBadge}</span>
        )}
      </button>
      {railOpen && (
        <>
          <PanelToggleButton open={panels.statsOpen} label="Stats" onClick={panels.toggleStats} />
          <PanelToggleButton open={panels.treeOpen} label="Skills" onClick={panels.toggleTree} badge={spBadge} />
          <PanelToggleButton open={panels.actionsOpen} label="Actions" onClick={panels.toggleActions} />
          <PanelToggleButton open={panels.questOpen} label="Quest" onClick={panels.toggleQuest} />
          <PanelToggleButton open={panels.bagOpen} label="Bag" onClick={panels.toggleBag} />
          <PanelToggleButton open={panels.gearOpen} label="Gear" onClick={panels.toggleGear} />
          <PanelToggleButton open={panels.mapOpen} label="Map" onClick={panels.toggleMap} />
          <PanelToggleButton open={panels.wikiOpen} label="Wiki" onClick={panels.toggleWiki} />
          <PanelToggleButton open={panels.videoOpen} label="Video" onClick={panels.toggleVideo} />
          {isGm && <PanelToggleButton open={panels.gmOpen} label="GM" onClick={panels.toggleGm} />}
        </>
      )}
    </aside>
  );
}

function PanelToggleButton({
  open,
  label,
  onClick,
  badge,
}: {
  open: boolean;
  label: string;
  onClick: () => void;
  /** Optional small chip next to the label — e.g. unspent skill point count. */
  badge?: number | null;
}) {
  const hasBadge = badge !== undefined && badge !== null && badge > 0;
  return (
    <button
      type="button"
      className={`panel-toggle${open ? ' panel-toggle--open' : ''}${hasBadge ? ' panel-toggle--badged' : ''}`}
      aria-label={open ? `Hide ${label}` : `Show ${label}`}
      onClick={onClick}
    >
      {label}
      {hasBadge && (
        <span className="panel-toggle__badge" aria-label={`${badge} unspent`}>{badge}</span>
      )}
    </button>
  );
}
