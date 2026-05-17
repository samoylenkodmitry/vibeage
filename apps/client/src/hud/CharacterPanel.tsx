import { CLASS_SKILL_TREES, type CharacterClass } from '../../../../packages/content/classes';
import { CLASS_PASSIVES } from '../../../../packages/content/classPassives';
import { CHARACTER_RACES, RACE_PROFILES, type CharacterRace } from '../../../../packages/content/races';
import type { PlayerEntity } from '../gameTypes';
import { capitalize } from './textUtils';
import { useDraggablePanel } from './useDraggablePanel';

type CharacterPanelProps = {
  player: PlayerEntity | null;
  onSelectClass: (className: string) => void;
  onSelectRace: (race: string) => void;
};

const CLASS_NAMES = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];

export function CharacterPanel({ player, onSelectClass, onSelectRace }: CharacterPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('character');
  const activeRace = (player?.race ?? 'human') as CharacterRace;
  const activeClass = player?.className ?? 'mage';

  return (
    <section ref={panelRef} className="character-panel" aria-label="Character">
      <div className="panel-title">
        <strong>Character</strong>
        <span>{capitalize(activeRace)} {capitalize(activeClass)}</span>
      </div>
      <div className="character-section">
        <div className="character-section-label">Race</div>
        <div className="character-grid">
          {CHARACTER_RACES.map((race) => (
            <button
              key={race}
              type="button"
              className={`character-option${activeRace === race ? ' character-option--active' : ''}`}
              onClick={() => onSelectRace(race)}
              title={RACE_PROFILES[race].description}
            >
              {RACE_PROFILES[race].name}
            </button>
          ))}
        </div>
      </div>
      <div className="character-section">
        <div className="character-section-label">Class</div>
        <div className="character-grid">
          {CLASS_NAMES.map((className) => (
            <button
              key={className}
              type="button"
              className={`character-option${activeClass === className ? ' character-option--active' : ''}`}
              onClick={() => onSelectClass(className)}
              title={CLASS_SKILL_TREES[className]?.description}
            >
              {capitalize(className)}
            </button>
          ))}
        </div>
      </div>
      {CLASS_PASSIVES[activeClass as CharacterClass] && (
        <div className="character-section">
          <div className="character-section-label">Class Passive</div>
          <div
            className="character-passive"
            title={CLASS_PASSIVES[activeClass as CharacterClass].description}
          >
            <strong>{CLASS_PASSIVES[activeClass as CharacterClass].name}</strong>
            <small>{CLASS_PASSIVES[activeClass as CharacterClass].description}</small>
          </div>
        </div>
      )}
    </section>
  );
}
