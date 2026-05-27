import { UNIVERSAL_SKILLS, type SkillId } from './skills.js';
import { CLASS_SKILL_TREES, type CharacterClass } from './classes.js';
import { SPECIALIZATIONS } from './specializations.js';
import { ENEMY_TEMPLATES } from './enemies.js';
import { MINI_BOSSES } from './miniBosses.js';
import { bossSignatureSkillId } from './bossSkills.js';

/**
 * Reverse index: who uses a skill (docs/ABILITY_SYSTEM.md §3). The wiki
 * renders these as chips ("used by …") and a test pins that every skill
 * has ≥1 user, so no ability ships orphaned. One source of truth — class
 * trees, specializations, and enemy templates — drives both.
 */
export type SkillUserKind = 'class' | 'spec' | 'mob' | 'boss';
export interface SkillUser {
  kind: SkillUserKind;
  id: string;        // class id / spec id / mob type / boss id — for wiki navigation
  name: string;      // display label for the chip
}

/** Classes that learn a skill via their tree (incl. the universal skills). */
function classUsers(skillId: SkillId): SkillUser[] {
  const out: SkillUser[] = [];
  const universal = UNIVERSAL_SKILLS.includes(skillId);
  for (const [cls, tree] of Object.entries(CLASS_SKILL_TREES) as Array<[CharacterClass, (typeof CLASS_SKILL_TREES)[CharacterClass]]>) {
    if (universal || tree.skillProgression[skillId]) out.push({ kind: 'class', id: cls, name: tree.className });
  }
  return out;
}

/** Specializations that grant a skill at spec/proficiency level. */
function specUsers(skillId: SkillId): SkillUser[] {
  const out: SkillUser[] = [];
  for (const spec of Object.values(SPECIALIZATIONS)) {
    if (spec.specSkills?.includes(skillId) || spec.proficiencySkills?.includes(skillId)) {
      out.push({ kind: 'spec', id: spec.id, name: spec.name });
    }
  }
  return out;
}

/** Enemy templates that carry a skill in their loadout. */
function mobUsers(skillId: SkillId): SkillUser[] {
  const out: SkillUser[] = [];
  for (const [type, tmpl] of Object.entries(ENEMY_TEMPLATES)) {
    if (tmpl.skills.includes(skillId)) out.push({ kind: 'mob', id: type, name: tmpl.displayName });
  }
  return out;
}

/** Mini-bosses whose signature is this skill. */
function bossUsers(skillId: SkillId): SkillUser[] {
  const out: SkillUser[] = [];
  for (const boss of Object.values(MINI_BOSSES)) {
    if (bossSignatureSkillId(boss.id) === skillId) out.push({ kind: 'boss', id: boss.id, name: boss.name });
  }
  return out;
}

/** Every combatant — class, spec, mob, boss — that uses `skillId`. */
export function skillUsers(skillId: SkillId): SkillUser[] {
  return [...classUsers(skillId), ...specUsers(skillId), ...mobUsers(skillId), ...bossUsers(skillId)];
}
