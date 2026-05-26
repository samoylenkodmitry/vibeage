import { useEffect, useState } from 'react';
import {
  getSpecializationById,
  PROFICIENCY_LEVEL,
  SPECIALIZATION_UNLOCK_LEVEL,
} from '../../../../packages/content/specializations';
import { STATS } from '../../../../packages/content/stats';
import type { StatId } from '../../../../packages/sim/statContributions';
import type { PlayerEntity } from '../gameTypes';
import { ActiveEffects } from './ActiveEffects';
import { StatBreakdownPopup } from './StatBreakdownPopup';
import { capitalize, DEFAULT_CLASS_NAME } from './textUtils';
import { useDraggablePanel } from './useDraggablePanel';
import { openWikiAt } from './wikiNavBus';

export function PlayerPanel({
  player,
  equipment,
}: { player: PlayerEntity | null; equipment?: Record<string, string> }) {
  const stats = derivePanelStats(player);
  const derived = player?.stats ?? {};
  const panelRef = useDraggablePanel<HTMLElement>('stats');
  const [popup, setPopup] = useState<{ statId: StatId; clientX: number; clientY: number } | null>(null);
  // §49/M2 follow-up — derived combat stats (pAtk, mAtk, …) collapse
  // behind a tap-to-expand on mobile so the 12-row grid doesn't eat
  // 5 % of the world-visibility ratio. Desktop stays expanded by
  // default. Preference is sticky per device via localStorage.
  const [combatOpen, setCombatOpen] = useCombatStatsOpenState();
  const raceLabel = player?.race ? capitalize(player.race) : '';
  const level = player?.level ?? 1;
  const spec = player?.specializationId ? getSpecializationById(player.specializationId) ?? null : null;
  const specLine = spec
    ? `${spec.name}${level >= PROFICIENCY_LEVEL ? ' (Proficient)' : ''}`
    : level >= SPECIALIZATION_UNLOCK_LEVEL
      ? `pick at Lv ${SPECIALIZATION_UNLOCK_LEVEL}`
      : `unlocks at Lv ${SPECIALIZATION_UNLOCK_LEVEL}`;

  return (
    <section ref={panelRef} className="hud player-panel" aria-label="Player status">
      <div className="panel-title">
        <strong>Stats</strong>
        <span>{raceLabel ? `${raceLabel} ${stats.className}` : stats.className}</span>
      </div>
      <small className="player-spec-line" title="Specialization">
        Spec: {specLine}
      </small>
      <dl className="player-stats">
        <div><dt>Level</dt><dd>{player?.level ?? 1}</dd></div>
        <div><dt>SP</dt><dd>{stats.skillPoints}</dd></div>
        {ATTR_IDS.map((id) => (
          <StatRow
            key={id}
            id={id}
            value={derived[id] ?? attrFallback(stats, id)}
            onClick={makeOpenPopup(setPopup, id)}
          />
        ))}
      </dl>
      {derived.pAtk !== undefined && (
        <>
          <button
            type="button"
            className="player-stats-combat-toggle"
            aria-expanded={combatOpen}
            aria-controls="player-combat-stats"
            onClick={() => setCombatOpen((open) => !open)}
          >
            Combat stats {combatOpen ? '▴' : '▾'}
          </button>
          {combatOpen && (
            <dl className="player-stats player-stats-combat" id="player-combat-stats">
              {DERIVED_ROWS.map(({ id, format }) => (
                <StatRow
                  key={id}
                  id={id}
                  value={format(derived[id])}
                  onClick={makeOpenPopup(setPopup, id)}
                />
              ))}
            </dl>
          )}
        </>
      )}
      <ActiveEffects effects={player?.statusEffects ?? []} />
      {popup && player && (
        <StatBreakdownPopup
          statId={popup.statId}
          player={player}
          equipment={equipment ?? {}}
          clientX={popup.clientX}
          clientY={popup.clientY}
          onClose={() => setPopup(null)}
        />
      )}
    </section>
  );
}

const ATTR_IDS: readonly StatId[] = ['str', 'dex', 'con', 'int', 'wit', 'men'];

const COMBAT_OPEN_STORAGE_KEY = 'vibeage.playerPanel.combatStats.open.v1';
const MOBILE_BREAKPOINT_PX = 680;

function useCombatStatsOpenState(): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [open, setOpenState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem(COMBAT_OPEN_STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    // Default: collapsed on phone-width viewports, expanded otherwise.
    return window.innerWidth > MOBILE_BREAKPOINT_PX;
  });
  useEffect(() => {
    try { window.localStorage.setItem(COMBAT_OPEN_STORAGE_KEY, String(open)); } catch {
      // Storage may be denied (Safari private mode, etc.); the UI
      // still works, the preference just doesn't persist.
    }
  }, [open]);
  return [open, setOpenState];
}

type DerivedRowSpec = { id: StatId; format: (v: number | undefined) => number | undefined };
const DERIVED_ROWS: readonly DerivedRowSpec[] = [
  { id: 'pAtk', format: (v) => v },
  { id: 'mAtk', format: (v) => v },
  { id: 'pDef', format: (v) => v },
  { id: 'mDef', format: (v) => v },
  { id: 'hpRegen', format: (v) => v },
  { id: 'mpRegen', format: (v) => v },
  { id: 'accuracy', format: (v) => v },
  { id: 'evasion', format: (v) => v },
  { id: 'attackSpeed', format: (v) => v },
  { id: 'castSpeed', format: (v) => (v !== undefined ? Number(v.toFixed(2)) : undefined) },
  { id: 'runSpeed', format: (v) => v },
  { id: 'critChance', format: (v) => (v !== undefined ? Math.round(v * 100) : 0) },
];

function attrFallback(stats: DerivedStats, id: StatId): number | undefined {
  switch (id) {
    case 'str': return stats.strength;
    case 'dex': return stats.dexterity;
    case 'con': return stats.constitution;
    case 'int': return stats.intellect;
    case 'wit': return stats.wit;
    case 'men': return stats.mental;
    default: return undefined;
  }
}

function makeOpenPopup(
  setPopup: (p: { statId: StatId; clientX: number; clientY: number } | null) => void,
  statId: StatId,
) {
  return (e: React.MouseEvent) => {
    setPopup({ statId, clientX: e.clientX, clientY: e.clientY });
  };
}

function StatRow({
  id, value, label, onClick,
}: {
  id: string;
  value: number | undefined;
  label?: string;
  /** PR OO — overrides the legacy wiki-open behaviour. */
  onClick?: (e: React.MouseEvent) => void;
}) {
  // PR II — label defaults to STATS[id].short so the HUD and the wiki
  // share one display name per stat. `label` override stays for tests
  // / non-registered ids only. Description likewise comes from STATS.
  const entry = STATS[id];
  const resolvedLabel = label ?? entry?.short ?? id;
  const desc = entry?.description ?? '';
  return (
    <div
      title={desc}
      className="player-stat-link"
      role="button"
      tabIndex={0}
      onClick={onClick ?? (() => openWikiAt('stats', id))}
      onContextMenu={(e) => { e.preventDefault(); openWikiAt('stats', id); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openWikiAt('stats', id); }}
    >
      <dt>{resolvedLabel}</dt><dd>{value ?? '-'}</dd>
    </div>
  );
}

type DerivedStats = {
  className: string;
  strength: number;
  dexterity: number;
  constitution: number;
  intellect: number;
  wit: number;
  mental: number;
  skillPoints: number;
  unlockedSkills: number;
};

function derivePanelStats(player: PlayerEntity | null): DerivedStats {
  const className = player?.className ?? DEFAULT_CLASS_NAME;
  const level = player?.level ?? 1;
  const weights = STAT_WEIGHTS[className] ?? STAT_WEIGHTS.default;
  return {
    className: capitalize(className),
    strength: 8 + Math.floor(level * weights.str),
    dexterity: 8 + Math.floor(level * weights.dex),
    constitution: 8 + Math.floor(level * weights.con),
    intellect: 8 + Math.floor(level * weights.int),
    wit: 8 + Math.floor(level * weights.wit),
    mental: 8 + Math.floor(level * weights.men),
    skillPoints: player?.availableSkillPoints ?? 0,
    unlockedSkills: player?.unlockedSkills?.length ?? 0,
  };
}

type StatWeights = { str: number; dex: number; con: number; int: number; wit: number; men: number };

const STAT_WEIGHTS: Record<string, StatWeights> = {
  warrior: { str: 2.4, dex: 1.2, con: 2.0, int: 0.8, wit: 0.8, men: 0.8 },
  ranger: { str: 1.4, dex: 2.4, con: 1.4, int: 1.0, wit: 1.6, men: 1.0 },
  mage: { str: 0.8, dex: 1.0, con: 1.0, int: 2.6, wit: 2.2, men: 1.4 },
  healer: { str: 1.4, dex: 1.0, con: 1.6, int: 2.0, wit: 1.4, men: 2.4 },
  knight: { str: 2.2, dex: 1.0, con: 2.4, int: 1.0, wit: 0.8, men: 1.0 },
  paladin: { str: 1.8, dex: 1.0, con: 2.0, int: 1.6, wit: 1.0, men: 2.0 },
  rogue: { str: 1.4, dex: 2.6, con: 1.2, int: 0.8, wit: 1.6, men: 1.0 },
  default: { str: 1.5, dex: 1.5, con: 1.5, int: 1.5, wit: 1.5, men: 1.5 },
};
