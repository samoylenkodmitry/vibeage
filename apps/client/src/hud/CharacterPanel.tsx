import { CLASS_SKILL_TREES, type CharacterClass } from '../../../../packages/content/classes';
import { CLASS_PASSIVES } from '../../../../packages/content/classPassives';
import { CHARACTER_RACES, RACE_PROFILES, type CharacterRace } from '../../../../packages/content/races';
import {
  getSpecializationById,
  getSpecializationsForClass,
  SPECIALIZATION_UNLOCK_LEVEL,
  PROFICIENCY_LEVEL,
  type Specialization,
} from '../../../../packages/content/specializations';
import type { PlayerEntity } from '../gameTypes';
import { capitalize } from './textUtils';
import { useDraggablePanel } from './useDraggablePanel';

type CharacterPanelProps = {
  player: PlayerEntity | null;
  onSelectClass: (className: string) => void;
  onSelectRace: (race: string) => void;
  onSelectSpecialization: (specializationId: string) => void;
};

const CLASS_NAMES = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];

export function CharacterPanel({
  player,
  onSelectClass,
  onSelectRace,
  onSelectSpecialization,
}: CharacterPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('character');
  const activeRace = (player?.race ?? 'human') as CharacterRace;
  const activeClass = player?.className ?? 'mage';
  const level = player?.level ?? 1;
  const activeSpec = player?.specializationId ? getSpecializationById(player.specializationId) ?? null : null;
  const classSpecs = getSpecializationsForClass(activeClass);

  return (
    <section ref={panelRef} className="character-panel" aria-label="Character">
      <div className="panel-title">
        <strong>Character</strong>
        <span>{capitalize(activeRace)} {capitalize(activeClass)}</span>
      </div>
      <RaceSection activeRace={activeRace} onSelectRace={onSelectRace} />
      <ClassSection activeClass={activeClass} onSelectClass={onSelectClass} />
      {CLASS_PASSIVES[activeClass as CharacterClass] && <ClassPassiveSection activeClass={activeClass} />}
      {classSpecs.length > 0 && (
        <SpecializationSection
          level={level}
          activeSpec={activeSpec}
          classSpecs={classSpecs}
          onSelectSpecialization={onSelectSpecialization}
        />
      )}
    </section>
  );
}

function RaceSection({ activeRace, onSelectRace }: { activeRace: CharacterRace; onSelectRace: (race: string) => void }) {
  return (
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
  );
}

function ClassSection({ activeClass, onSelectClass }: { activeClass: CharacterClass; onSelectClass: (className: string) => void }) {
  return (
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
  );
}

function ClassPassiveSection({ activeClass }: { activeClass: CharacterClass }) {
  const passive = CLASS_PASSIVES[activeClass];
  return (
    <div className="character-section">
      <div className="character-section-label">Class Passive</div>
      <div className="character-passive" title={passive.description}>
        <strong>{passive.name}</strong>
        <small>{passive.description}</small>
      </div>
    </div>
  );
}

function SpecializationSection({
  level,
  activeSpec,
  classSpecs,
  onSelectSpecialization,
}: {
  level: number;
  activeSpec: Specialization | null;
  classSpecs: Specialization[];
  onSelectSpecialization: (specializationId: string) => void;
}) {
  const canPickSpec = level >= SPECIALIZATION_UNLOCK_LEVEL && !activeSpec;
  const isProficient = level >= PROFICIENCY_LEVEL;
  return (
    <div className="character-section">
      <div className="character-section-label">
        Specialization {activeSpec ? `— ${activeSpec.name}` : `(unlocks at Lv ${SPECIALIZATION_UNLOCK_LEVEL})`}
      </div>
      {activeSpec ? (
        <div className="character-passive" title={activeSpec.description}>
          <strong>{activeSpec.specializationPassive.name}</strong>
          <small>{activeSpec.specializationPassive.description}</small>
          {isProficient ? (
            <>
              <strong style={{ marginTop: 4 }}>{activeSpec.proficiencyPassive.name} (Proficient)</strong>
              <small>{activeSpec.proficiencyPassive.description}</small>
            </>
          ) : (
            <small style={{ opacity: 0.7 }}>Proficiency unlocks at Lv {PROFICIENCY_LEVEL}.</small>
          )}
        </div>
      ) : (
        <div className="character-grid">
          {classSpecs.map((spec) => (
            <button
              key={spec.id}
              type="button"
              className="character-option"
              onClick={() => canPickSpec && onSelectSpecialization(spec.id)}
              disabled={!canPickSpec}
              title={`${spec.description} — ${spec.specializationPassive.description}`}
            >
              {spec.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
