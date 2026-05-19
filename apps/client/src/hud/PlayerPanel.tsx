import {
  getSpecializationById,
  PROFICIENCY_LEVEL,
  SPECIALIZATION_UNLOCK_LEVEL,
} from '../../../../packages/content/specializations';
import { STATS } from '../../../../packages/content/stats';
import type { PlayerEntity } from '../gameTypes';
import { StatusPills } from './hudPrimitives';
import { capitalize, DEFAULT_CLASS_NAME } from './textUtils';
import { useDraggablePanel } from './useDraggablePanel';
import { openWikiAt } from './wikiNavBus';

export function PlayerPanel({ player }: { player: PlayerEntity | null }) {
  const stats = derivePanelStats(player);
  const derived = player?.stats ?? {};
  const panelRef = useDraggablePanel<HTMLElement>('stats');
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
        <StatRow id="str" label="STR" value={derived.str ?? stats.strength} />
        <StatRow id="dex" label="DEX" value={derived.dex ?? stats.dexterity} />
        <StatRow id="con" label="CON" value={derived.con ?? stats.constitution} />
        <StatRow id="int" label="INT" value={derived.int ?? stats.intellect} />
        <StatRow id="wit" label="WIT" value={derived.wit ?? stats.wit} />
        <StatRow id="men" label="MEN" value={derived.men ?? stats.mental} />
      </dl>
      {derived.pAtk !== undefined && (
        <dl className="player-stats player-stats-combat">
          {/* PR II — every derived stat is a wiki chip (same StatRow
              treatment as STR/DEX/etc.). Labels come from the STATS
              registry so renaming a stat propagates here too. */}
          <StatRow id="pAtk" label="P.Atk" value={derived.pAtk} />
          <StatRow id="mAtk" label="M.Atk" value={derived.mAtk} />
          <StatRow id="pDef" label="P.Def" value={derived.pDef} />
          <StatRow id="mDef" label="M.Def" value={derived.mDef} />
          <StatRow id="hpRegen" label="HP/s" value={derived.hpRegen} />
          <StatRow id="mpRegen" label="MP/s" value={derived.mpRegen} />
          <StatRow id="accuracy" label="Acc" value={derived.accuracy} />
          <StatRow id="evasion" label="Evd" value={derived.evasion} />
          <StatRow id="attackSpeed" label="Atk Spd" value={derived.attackSpeed} />
          <StatRow id="castSpeed" label="Cast Spd" value={derived.castSpeed !== undefined ? Number(derived.castSpeed.toFixed(2)) : undefined} />
          <StatRow id="runSpeed" label="Speed" value={derived.runSpeed} />
          <StatRow id="critChance" label="Crit %" value={derived.critChance !== undefined ? Math.round(derived.critChance * 100) : 0} />
        </dl>
      )}
      <StatusPills effects={player?.statusEffects ?? []} />
    </section>
  );
}

function StatRow({ id, label, value }: { id: string; label: string; value: number | undefined }) {
  // Tooltip carries the one-liner; clicking opens the Wiki Stats
  // tab focused on that attribute for the full description.
  const desc = STATS[id]?.description ?? '';
  return (
    <div
      title={desc}
      className="player-stat-link"
      role="button"
      tabIndex={0}
      onClick={() => openWikiAt('stats', id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openWikiAt('stats', id); }}
    >
      <dt>{label}</dt><dd>{value ?? '-'}</dd>
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
