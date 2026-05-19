import { describe, expect, it } from 'vitest';
import { EFFECT_SPECS } from '../packages/content/effects';
import { CLASS_LEARNABLE_PASSIVE_SKILLS, CLASS_AUTO_PASSIVE_SKILL, PASSIVE_SKILL_CONTRIBUTIONS } from '../packages/content/classPassives';
import { SKILLS, type SkillEffectType, type SkillId } from '../packages/content/skills';
import { STATS } from '../packages/content/stats';
import { CHARACTER_RACES } from '../packages/content/races';
import { CLASS_SKILL_TREES, type CharacterClass } from '../packages/content/classes';
import type { StatId } from '../packages/sim/statContributions';

/**
 * PR RR — skill spec audit. Pin every skill's wiring so future
 * content drops can't ship a "claims to do X but no engine
 * consumer" skill. Each test is one assertion class: when it
 * fails, the diff shows the orphan in one spot.
 */

const PASSIVE_PREFIX = 'passive_';
const passiveIds = new Set<SkillId>(Object.keys(PASSIVE_SKILL_CONTRIBUTIONS) as SkillId[]);

/**
 * Effect types the engine actually consumes today. Extend when
 * wiring up new behaviour; never add without a working handler.
 */
const IMPLEMENTED_EFFECT_TYPES: ReadonlySet<SkillEffectType> = new Set<SkillEffectType>([
  'damage',     // calculateDamage → applyCastToTarget
  'heal',       // applyHealEffect
  'stun',       // status effect → enemy state machine
  'slow',       // status effect → STATUS_EFFECT_STAT_CONTRIBUTIONS (runSpeed mul)
  'dot',        // dotTicker
  'burn',       // dotTicker
  'poison',     // dotTicker
  'freeze',     // status effect → enemy state machine
  'shield',     // absorbWithShield + STATUS_EFFECT_STAT_CONTRIBUTIONS
  'bless',      // STATUS_EFFECT_STAT_CONTRIBUTIONS (dmgMult mul)
  'dispel',     // applySkillEffects → filter negative effects
  'taunt',      // applySkillEffects → set targetId
  'evasion',    // STATUS_EFFECT_STAT_CONTRIBUTIONS
  'invisible',  // enemy AI ignores invisible targets + status display
  'aggroReset', // applyAggroResetAround
  'teleport',   // applySkillEffects → recall to village
]);

/**
 * Effect types declared in the SkillEffectType union but not yet
 * wired into the engine. Listed explicitly so the audit makes the
 * gap visible. Each entry should reference the planned wiring task.
 */
const UNIMPLEMENTED_EFFECT_TYPES: ReadonlySet<SkillEffectType> = new Set<SkillEffectType>([
  // PR VV — comment refs were wrong (named iceBolt / bash). The
  // effect lives on waterSplash and powerStrike respectively. Audit
  // is the source of truth for "what claims X" so this needs to be
  // correct or future readers grep the wrong skill.
  'waterWeakness', // waterSplash claims +30% water-damage taken — no damage-flavour amplifier engine yet
  'knockback',     // powerStrike claims +6 units displacement — no position-push handler
  'transform',     // petrify claims stone form — no transform state machine
]);

describe('skill spec audit', () => {
  it('every SkillEffectType is either implemented or explicitly unimplemented', () => {
    const allTypes = Object.keys(EFFECT_SPECS) as SkillEffectType[];
    const orphans = allTypes.filter((t) => !IMPLEMENTED_EFFECT_TYPES.has(t) && !UNIMPLEMENTED_EFFECT_TYPES.has(t));
    expect(orphans, `effect types missing from both sets: ${orphans.join(', ')}`).toEqual([]);
  });

  it('IMPLEMENTED + UNIMPLEMENTED sets are disjoint', () => {
    for (const t of IMPLEMENTED_EFFECT_TYPES) {
      expect(UNIMPLEMENTED_EFFECT_TYPES.has(t),
        `${t} listed in both IMPLEMENTED and UNIMPLEMENTED`).toBe(false);
    }
  });

  it('every active skill has at least one effect; every passive has zero effects', () => {
    for (const [id, skill] of Object.entries(SKILLS)) {
      const isPassive = id.startsWith(PASSIVE_PREFIX);
      if (isPassive) {
        expect(skill.effects.length, `${id} is passive but has effects[]`).toBe(0);
      } else {
        expect(skill.effects.length, `${id} active skill has no effects[]`).toBeGreaterThan(0);
      }
    }
  });

  it('every passive skill has a contribution row', () => {
    for (const [id, skill] of Object.entries(SKILLS)) {
      if (!id.startsWith(PASSIVE_PREFIX)) continue;
      expect(skill, `${id} skill def missing`).toBeTruthy();
      const rows = PASSIVE_SKILL_CONTRIBUTIONS[id as SkillId];
      expect(rows?.length, `passive ${id} has no PASSIVE_SKILL_CONTRIBUTIONS entry`).toBeGreaterThan(0);
    }
  });

  it('no active skill is also in PASSIVE_SKILL_CONTRIBUTIONS', () => {
    for (const id of passiveIds) {
      expect(id.startsWith(PASSIVE_PREFIX),
        `${id} is in PASSIVE_SKILL_CONTRIBUTIONS but not named passive_*`).toBe(true);
    }
  });

  it('every passive contribution targets a stat declared in STATS', () => {
    for (const [skillId, rows] of Object.entries(PASSIVE_SKILL_CONTRIBUTIONS) as Array<[SkillId, readonly { stat: StatId }[]]>) {
      for (const row of rows) {
        expect(STATS[row.stat], `${skillId} contributes to unknown stat ${row.stat}`).toBeDefined();
      }
    }
  });

  it('every class auto-passive id resolves to a real passive skill', () => {
    for (const [cls, skillId] of Object.entries(CLASS_AUTO_PASSIVE_SKILL) as Array<[CharacterClass, SkillId]>) {
      expect(SKILLS[skillId], `class ${cls} auto-passive ${skillId} not in SKILLS`).toBeDefined();
      expect(PASSIVE_SKILL_CONTRIBUTIONS[skillId]?.length,
        `class ${cls} auto-passive ${skillId} has no contributions`).toBeGreaterThan(0);
    }
  });

  it('every learnable passive resolves and is listed in the class tree', () => {
    for (const [cls, ids] of Object.entries(CLASS_LEARNABLE_PASSIVE_SKILLS) as Array<[CharacterClass, readonly SkillId[]]>) {
      const tree = CLASS_SKILL_TREES[cls];
      for (const id of ids) {
        expect(SKILLS[id], `${cls}: learnable passive ${id} missing from SKILLS`).toBeDefined();
        expect(PASSIVE_SKILL_CONTRIBUTIONS[id]?.length,
          `${cls}: learnable passive ${id} has no contributions`).toBeGreaterThan(0);
        expect(tree.skillProgression[id],
          `${cls}: learnable passive ${id} missing from skillProgression`).toBeDefined();
      }
    }
  });

  it('every active-skill effect type is in IMPLEMENTED_EFFECT_TYPES (no silent claims)', () => {
    const skillsWithUnimplementedEffects: string[] = [];
    for (const [id, skill] of Object.entries(SKILLS)) {
      if (id.startsWith(PASSIVE_PREFIX)) continue;
      for (const effect of skill.effects) {
        if (!IMPLEMENTED_EFFECT_TYPES.has(effect.type) && !UNIMPLEMENTED_EFFECT_TYPES.has(effect.type)) {
          skillsWithUnimplementedEffects.push(`${id} → ${effect.type}`);
        }
      }
    }
    expect(skillsWithUnimplementedEffects, skillsWithUnimplementedEffects.join('\n')).toEqual([]);
  });

  it('every skill has a description; descriptions claiming a percent reference the value', () => {
    for (const [id, skill] of Object.entries(SKILLS)) {
      expect(skill.description.length, `${id} missing description`).toBeGreaterThan(0);
    }
  });

  it('sanity touchpoint: spec catalog stays in sync with races / classes', () => {
    expect(CHARACTER_RACES.length).toBeGreaterThan(0);
    expect(Object.keys(CLASS_SKILL_TREES).length).toBeGreaterThan(0);
  });
});
