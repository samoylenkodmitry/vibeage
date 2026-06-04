import { useMemo } from 'react';
import { SKILLS } from '../../../../packages/content/skills';
import { SPECIALIZATION_IDENTITIES } from '../../../../packages/content/specializationIdentity';
import { skillMechanicSummary } from '../../../../packages/content/skillMechanics';
import {
  getSpecializationsForClass,
  PROFICIENCY_LEVEL,
  SPECIALIZATION_UNLOCK_LEVEL,
  type Specialization,
} from '../../../../packages/content/specializations';
import type { CharacterClass } from '../../../../packages/content/classes';
import type { PlayerEntity } from '../gameTypes';
import { capitalize, DEFAULT_CLASS_NAME } from './textUtils';

type SpecializationChooserProps = {
  player: PlayerEntity | null;
  onSelectSpecialization: (specializationId: string) => void;
};

export type SpecializationChoice = {
  id: string;
  name: string;
  icon: string;
  description: string;
  passiveName: string;
  passiveDescription: string;
  identity: string;
  loop: string;
  specSkills: string;
  mechanics: string;
  proficiency: string;
};

export function SpecializationChooser({ player, onSelectSpecialization }: SpecializationChooserProps) {
  const choices = useMemo(() => buildSpecializationChoices(player), [player?.className]);
  if (!canChooseSpecialization(player) || choices.length === 0) return null;
  return (
    <section className="spec-chooser" aria-label="Choose specialization">
      <header>
        <strong>Choose a specialization</strong>
        <span>{capitalize(player?.className ?? DEFAULT_CLASS_NAME)} Lv {SPECIALIZATION_UNLOCK_LEVEL}</span>
      </header>
      <p>
        Pick one branch to activate its passive. Its spec skills become learnable in the rows below.
      </p>
      <div className="spec-choice-list">
        {choices.map((choice) => (
          <SpecChoice key={choice.id} choice={choice} onSelect={onSelectSpecialization} />
        ))}
      </div>
    </section>
  );
}

export function canChooseSpecialization(player: PlayerEntity | null): boolean {
  return Boolean(player?.isAlive && !player.specializationId && (player.level ?? 1) >= SPECIALIZATION_UNLOCK_LEVEL);
}

export function buildSpecializationChoices(player: PlayerEntity | null): SpecializationChoice[] {
  const className = (player?.className ?? DEFAULT_CLASS_NAME) as CharacterClass;
  return getSpecializationsForClass(className).map(toChoice);
}

function SpecChoice({
  choice,
  onSelect,
}: {
  choice: SpecializationChoice;
  onSelect: (specializationId: string) => void;
}) {
  return (
    <article className="spec-choice">
      <header>
        <img className="spec-choice-icon" src={choice.icon} alt="" aria-hidden="true" />
        <div>
          <strong>{choice.name}</strong>
          <small>{choice.description}</small>
        </div>
      </header>
      <dl>
        <SpecPair label="Identity" value={choice.identity} />
        <SpecPair label="Loop" value={choice.loop} />
        <SpecPair label="Passive" value={`${choice.passiveName}: ${choice.passiveDescription}`} />
        <SpecPair label="Skills" value={choice.specSkills} />
        {choice.mechanics && <SpecPair label="Mechanics" value={choice.mechanics} />}
        <SpecPair label={`Lv ${PROFICIENCY_LEVEL}`} value={choice.proficiency} />
      </dl>
      <button type="button" className="learn-skill-button spec-choice-button" onClick={() => onSelect(choice.id)}>
        Choose
      </button>
    </article>
  );
}

function SpecPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="spec-choice-pair">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function toChoice(spec: Specialization): SpecializationChoice {
  const identity = SPECIALIZATION_IDENTITIES[spec.id];
  return {
    id: spec.id,
    name: spec.name,
    icon: spec.icon,
    description: spec.description,
    passiveName: spec.specializationPassive.name,
    passiveDescription: spec.specializationPassive.description,
    identity: identity.fantasy,
    loop: identity.primaryLoop,
    specSkills: labelSkills(spec.specSkills),
    mechanics: labelMechanics([...(spec.specSkills ?? []), ...(spec.proficiencySkills ?? [])]),
    proficiency: `${spec.proficiencyPassive.name}: ${spec.proficiencyPassive.description}`,
  };
}

function labelSkills(skillIds: readonly string[] | undefined): string {
  const names = (skillIds ?? []).map((id) => SKILLS[id]?.name ?? id);
  return names.length > 0 ? names.join(', ') : 'No spec-only skills';
}

function labelMechanics(skillIds: readonly string[]): string {
  return skillMechanicSummary(skillIds.flatMap((id) => SKILLS[id] ? [SKILLS[id]] : []));
}
