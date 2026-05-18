import { STATS } from '../../../../packages/content/stats';
import type { PlayerEntity } from '../gameTypes';
import { StatusPills } from './hudPrimitives';
import { capitalize, DEFAULT_CLASS_NAME } from './textUtils';
import { useDraggablePanel } from './useDraggablePanel';

export function PlayerPanel({ player }: { player: PlayerEntity | null }) {
  const stats = derivePanelStats(player);
  const derived = player?.stats ?? {};
  const panelRef = useDraggablePanel<HTMLElement>('stats');
  const raceLabel = player?.race ? capitalize(player.race) : '';

  return (
    <section ref={panelRef} className="hud player-panel" aria-label="Player status">
      <div className="panel-title">
        <strong>Stats</strong>
        <span>{raceLabel ? `${raceLabel} ${stats.className}` : stats.className}</span>
      </div>
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
          <div><dt>P.Atk</dt><dd>{derived.pAtk}</dd></div>
          <div><dt>M.Atk</dt><dd>{derived.mAtk}</dd></div>
          <div><dt>P.Def</dt><dd>{derived.pDef}</dd></div>
          <div><dt>M.Def</dt><dd>{derived.mDef}</dd></div>
          <div><dt>HP/s</dt><dd>{derived.hpRegen}</dd></div>
          <div><dt>MP/s</dt><dd>{derived.mpRegen}</dd></div>
          <div><dt>Acc</dt><dd>{derived.accuracy}</dd></div>
          <div><dt>Evd</dt><dd>{derived.evasion}</dd></div>
          <div><dt>Atk Spd</dt><dd>{derived.attackSpeed}</dd></div>
          <div><dt>Cast Spd</dt><dd>{derived.castSpeed?.toFixed(2)}</dd></div>
          <div><dt>Speed</dt><dd>{derived.runSpeed}</dd></div>
          <div><dt>Crit %</dt><dd>{derived.critChance ? Math.round(derived.critChance * 100) : 0}</dd></div>
        </dl>
      )}
      <StatusPills effects={player?.statusEffects ?? []} />
    </section>
  );
}

function StatRow({ id, label, value }: { id: string; label: string; value: number | undefined }) {
  // Tooltip reveals what each attribute influences. The Wiki Stats
  // tab has the full rendered description; here we just surface the
  // one-liner so curious players don't need to open a panel to know
  // what STR does.
  const desc = STATS[id]?.description ?? '';
  return (
    <div title={desc}><dt>{label}</dt><dd>{value ?? '-'}</dd></div>
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
