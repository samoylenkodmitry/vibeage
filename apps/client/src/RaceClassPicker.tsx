import { useEffect } from 'react';
import {
  CLASS_DIFFICULTY,
  CLASS_SKILL_TREES,
  getStarterSkillForClass,
  type CharacterClass,
} from '../../../packages/content/classes';
import { CHARACTER_RACES, getRaceStatTendency, RACE_PROFILES, type CharacterRace } from '../../../packages/content/races';
import { raceIconPath } from '../../../packages/content/raceIcons';
import { SKILLS } from '../../../packages/content/skills';

/**
 * Reusable race + prophecy(class) picker. Extracted from the Lobby's
 * CreateCharacterForm so the pre-game lobby and the in-world Awakening panel
 * share one picker (same art, same race→class gating, same detail blurbs) and
 * can't drift apart.
 *
 * Controlled component: the parent owns `race` / `className`. When the chosen
 * race doesn't allow the current class, the picker self-corrects to the
 * race's first allowed class via `onClassName` — so callers never have to
 * duplicate that effect.
 */
export function RaceClassPicker({
  race,
  className,
  onRace,
  onClassName,
}: {
  race: CharacterRace;
  className: CharacterClass;
  onRace: (race: CharacterRace) => void;
  onClassName: (className: CharacterClass) => void;
}) {
  const allowed = RACE_PROFILES[race]?.allowedClasses ?? [];

  useEffect(() => {
    if (allowed.length > 0 && !allowed.includes(className)) {
      onClassName(allowed[0]);
    }
  }, [allowed, className, onClassName]);

  return (
    <>
      <fieldset className="character-fieldset">
        <legend>Race</legend>
        <div className="character-grid character-grid--portraits">
          {CHARACTER_RACES.map((option) => (
            <label key={option} className={`character-option character-option--race${race === option ? ' character-option--active' : ''}`}>
              <input type="radio" name="race" value={option} checked={race === option} onChange={() => onRace(option)} />
              <img className="character-option-portrait" src={raceIconPath(option)} alt="" aria-hidden="true" />
              <span>{RACE_PROFILES[option].name}</span>
            </label>
          ))}
        </div>
        <small className="character-blurb">{RACE_PROFILES[race]?.description ?? ''}</small>
        <RaceDetail race={race} />
      </fieldset>
      <fieldset className="character-fieldset">
        <legend>Prophecy</legend>
        <div className="character-grid">
          {allowed.map((option) => {
            const classIcon = CLASS_SKILL_TREES[option]?.icon;
            return (
              <label key={option} className={`character-option${className === option ? ' character-option--active' : ''}`}>
                <input type="radio" name="className" value={option} checked={className === option} onChange={() => onClassName(option)} />
                {classIcon && <img className="character-option-icon" src={classIcon} alt="" aria-hidden="true" />}
                <span>{option}</span>
              </label>
            );
          })}
        </div>
        <small className="character-blurb">{CLASS_SKILL_TREES[className]?.description ?? ''}</small>
        <ClassDetail classKey={className} />
      </fieldset>
    </>
  );
}

/**
 * §49/M2 — second-line detail under the class picker. Shows the starter skill
 * (so a fresh player knows what they'll press at spawn) + a one-word
 * difficulty hint.
 */
function ClassDetail({ classKey }: { classKey: CharacterClass }) {
  const starter = getStarterSkillForClass(classKey);
  const starterSkill = starter ? SKILLS[starter] : null;
  const difficulty = CLASS_DIFFICULTY[classKey];
  return (
    <div className="character-meta">
      {starterSkill && (
        <small className="character-meta-line">
          Starter: <strong>{starterSkill.name}</strong>
        </small>
      )}
      {difficulty && (
        <small className="character-meta-line">
          Difficulty: <strong>{difficulty}</strong>
        </small>
      )}
    </div>
  );
}

/**
 * §49/M2 — race tendency line under the race picker. Shows the top attributes
 * (strong: …) and where the race is weakest (weak: …). Balanced races (human)
 * show 'Balanced — no specialty' so we don't invent a strength.
 */
function RaceDetail({ race }: { race: CharacterRace }) {
  const tendency = getRaceStatTendency(race);
  return (
    <div className="character-meta">
      {tendency.balanced ? (
        <small className="character-meta-line">Balanced — no clear specialty</small>
      ) : (
        <>
          <small className="character-meta-line">
            Strong: <strong>{tendency.strong.join(', ').toUpperCase()}</strong>
          </small>
          {tendency.weak.length > 0 && (
            <small className="character-meta-line">
              Weak: <strong>{tendency.weak.join(', ').toUpperCase()}</strong>
            </small>
          )}
        </>
      )}
    </div>
  );
}
