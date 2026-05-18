import { CLASS_SKILL_TREES, type CharacterClass } from '../../../../packages/content/classes';
import { CLASS_PASSIVES } from '../../../../packages/content/classPassives';
import {
  CHARACTER_RACES,
  RACE_PROFILES,
  type CharacterRace,
} from '../../../../packages/content/races';
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
  const allowedClasses = RACE_PROFILES[activeRace]?.allowedClasses ?? [];

  return (
    <section ref={panelRef} className="character-panel" aria-label="Character">
      <div className="panel-title">
        <strong>Character</strong>
        <span>{capitalize(activeRace)} {capitalize(activeClass)}</span>
      </div>
      <RaceSection activeRace={activeRace} onSelectRace={onSelectRace} />
      <CharacterTree
        activeRace={activeRace}
        activeClass={activeClass}
        allowedClasses={allowedClasses}
        activeSpec={activeSpec}
        level={level}
        onSelectClass={onSelectClass}
        onSelectSpecialization={onSelectSpecialization}
      />
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
            title={`${RACE_PROFILES[race].description}\nClasses: ${RACE_PROFILES[race].allowedClasses.map((c) => capitalize(c)).join(', ')}`}
          >
            {RACE_PROFILES[race].name}
          </button>
        ))}
      </div>
    </div>
  );
}

function CharacterTree({
  activeRace,
  activeClass,
  allowedClasses,
  activeSpec,
  level,
  onSelectClass,
  onSelectSpecialization,
}: {
  activeRace: CharacterRace;
  activeClass: CharacterClass;
  allowedClasses: readonly CharacterClass[];
  activeSpec: Specialization | null;
  level: number;
  onSelectClass: (className: string) => void;
  onSelectSpecialization: (specializationId: string) => void;
}) {
  return (
    <div className="character-section">
      <div className="character-section-label">Heritage</div>
      <ul className="char-tree">
        <li className="char-tree-node char-tree-node--root">
          <span className="char-tree-label">{RACE_PROFILES[activeRace].name}</span>
          <ul className="char-tree-children">
            {allowedClasses.map((cls) => (
              <ClassBranch
                key={cls}
                cls={cls}
                isActive={cls === activeClass}
                activeSpec={cls === activeClass ? activeSpec : null}
                level={level}
                onSelectClass={onSelectClass}
                onSelectSpecialization={onSelectSpecialization}
              />
            ))}
          </ul>
        </li>
      </ul>
    </div>
  );
}

function ClassBranch({
  cls,
  isActive,
  activeSpec,
  level,
  onSelectClass,
  onSelectSpecialization,
}: {
  cls: CharacterClass;
  isActive: boolean;
  activeSpec: Specialization | null;
  level: number;
  onSelectClass: (className: string) => void;
  onSelectSpecialization: (specializationId: string) => void;
}) {
  const passive = CLASS_PASSIVES[cls];
  return (
    <li className={`char-tree-node${isActive ? ' char-tree-node--active' : ''}`}>
      <button
        type="button"
        className="char-tree-button"
        onClick={() => onSelectClass(cls)}
        title={CLASS_SKILL_TREES[cls]?.description}
      >
        {capitalize(cls)}{isActive ? ' ✓' : ''}
      </button>
      {isActive && (
        <ul className="char-tree-children">
          {passive && (
            <li className="char-tree-node char-tree-node--leaf">
              <span className="char-tree-label" title={passive.description}>Passive: {passive.name}</span>
            </li>
          )}
          <SpecBranch
            cls={cls}
            activeSpec={activeSpec}
            level={level}
            onSelectSpecialization={onSelectSpecialization}
          />
        </ul>
      )}
    </li>
  );
}

function SpecBranch({
  cls,
  activeSpec,
  level,
  onSelectSpecialization,
}: {
  cls: CharacterClass;
  activeSpec: Specialization | null;
  level: number;
  onSelectSpecialization: (specializationId: string) => void;
}) {
  const specs = getSpecializationsForClass(cls);
  if (specs.length === 0) return null;
  const canPick = level >= SPECIALIZATION_UNLOCK_LEVEL && !activeSpec;
  const isProficient = level >= PROFICIENCY_LEVEL;
  if (activeSpec) {
    return (
      <li className="char-tree-node">
        <span className="char-tree-label">Spec: {activeSpec.name}</span>
        <ul className="char-tree-children">
          <li className="char-tree-node char-tree-node--leaf">
            <span className="char-tree-label" title={activeSpec.specializationPassive.description}>
              Spec Passive: {activeSpec.specializationPassive.name}
            </span>
          </li>
          <li className={`char-tree-node char-tree-node--leaf${isProficient ? '' : ' char-tree-node--locked'}`}>
            <span className="char-tree-label" title={activeSpec.proficiencyPassive.description}>
              Proficiency: {activeSpec.proficiencyPassive.name}
              {isProficient ? '' : ` (Lv ${PROFICIENCY_LEVEL})`}
            </span>
          </li>
        </ul>
      </li>
    );
  }
  return (
    <li className="char-tree-node">
      <span className="char-tree-label">Spec (Lv {SPECIALIZATION_UNLOCK_LEVEL})</span>
      <ul className="char-tree-children">
        {specs.map((spec) => (
          <li key={spec.id} className="char-tree-node char-tree-node--leaf">
            <button
              type="button"
              className="char-tree-button"
              disabled={!canPick}
              onClick={() => canPick && onSelectSpecialization(spec.id)}
              title={`${spec.description} — ${spec.specializationPassive.description}`}
            >
              {spec.name}
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

