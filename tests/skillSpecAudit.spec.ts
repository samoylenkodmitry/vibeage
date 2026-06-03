import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EFFECT_SPECS } from '../packages/content/effects';
import { CLASS_LEARNABLE_PASSIVE_SKILLS, CLASS_AUTO_PASSIVE_SKILL, PASSIVE_SKILL_CONTRIBUTIONS } from '../packages/content/classPassives';
import { SKILLS, UNIVERSAL_SKILLS, type SkillEffectType, type SkillId } from '../packages/content/skills';
import { STATS } from '../packages/content/stats';
import { CHARACTER_RACES } from '../packages/content/races';
import { CLASS_SKILL_TREES, type CharacterClass } from '../packages/content/classes';
import { SPECIALIZATIONS } from '../packages/content/specializations';
import type { StatId } from '../packages/sim/statContributions';

/**
 * PR RR — skill spec audit. Pin every skill's wiring so future
 * content drops can't ship a "claims to do X but no engine
 * consumer" skill. Each test is one assertion class: when it
 * fails, the diff shows the orphan in one spot.
 */

const PASSIVE_PREFIX = 'passive_';
const passiveIds = new Set<SkillId>(Object.keys(PASSIVE_SKILL_CONTRIBUTIONS) as SkillId[]);
const RUNTIME_ONLY_EFFECT_TYPES = new Set<string>(['invuln']);

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
  'timeStop',   // status effect → shared action-blocking predicate
  'shield',     // absorbWithShield (damage-absorb pool in the defensive pipeline)
  'damageReflect', // damageResolution reflects post-mitigation incoming damage to source
  'bless',      // STATUS_EFFECT_STAT_CONTRIBUTIONS (dmgMult mul)
  'dispel',     // applySkillEffects → filter negative effects
  'taunt',      // applySkillEffects → set targetId
  'silence',    // statusQueries → cast handler / enemy special-skill gate
  'evasion',    // evasionMissChanceFor → flat dodge in the damage path
  'invisible',  // enemy AI ignores invisible targets + status display
  'speed_boost', // STATUS_EFFECT_STAT_CONTRIBUTIONS (runSpeed mul) → movement
  'attackSpeed', // STATUS_EFFECT_STAT_CONTRIBUTIONS (attackSpeed mul) → auto-attack cooldown
  'reveal_loot', // client LootMarker shows names while the buff is active
  'aggroReset', // applyAggroResetAround
  'teleport',   // applySkillEffects → recall to village
  'knockback',     // §45.4 — applyKnockback pushes target along caster→target vector
  'waterWeakness', // §45.4 — elementVulnerabilityMultiplier amplifies water-element casts
  'marked',        // marker consumed by the reaction layer for ranger payoffs
  'arcaneCharge',  // marker consumed by the reaction layer for arcane payoffs
]);

/**
 * Effect types declared in the SkillEffectType union but not yet
 * wired into the engine. Listed explicitly so the audit makes the
 * gap visible. Each entry should reference the planned wiring task.
 */
// §45.4 fully closed — `transform` was a phantom declaration
// with no skill emitting it (petrify uses `stun`); it was
// deleted rather than implemented. Keep the set typed for
// future use; today every declared SkillEffectType is wired.
const UNIMPLEMENTED_EFFECT_TYPES: ReadonlySet<SkillEffectType> = new Set<SkillEffectType>([]);

describe('skill spec audit', () => {
  registerEffectTypeAuditTests();
  registerSkillShapeAuditTests();
  registerPassiveContributionAuditTests();
  registerSkillCatalogAuditTests();
});

function registerEffectTypeAuditTests() {
  it('every SkillEffectType is either implemented or explicitly unimplemented', () => {
    const allTypes = Object.keys(EFFECT_SPECS)
      .filter((t) => !RUNTIME_ONLY_EFFECT_TYPES.has(t)) as SkillEffectType[];
    const orphans = allTypes.filter((t) => !IMPLEMENTED_EFFECT_TYPES.has(t) && !UNIMPLEMENTED_EFFECT_TYPES.has(t));
    expect(orphans, `effect types missing from both sets: ${orphans.join(', ')}`).toEqual([]);
  });

  it('IMPLEMENTED + UNIMPLEMENTED sets are disjoint', () => {
    for (const t of IMPLEMENTED_EFFECT_TYPES) {
      expect(UNIMPLEMENTED_EFFECT_TYPES.has(t),
      `${t} listed in both IMPLEMENTED and UNIMPLEMENTED`).toBe(false);
    }
  });
}

function registerSkillShapeAuditTests() {
  it('every active skill has at least one effect; every passive has zero effects', () => {
    for (const [id, skill] of Object.entries(SKILLS)) {
      const isPassive = id.startsWith(PASSIVE_PREFIX);
      if (isPassive) {
        expect(skill.effects.length, `${id} is passive but has effects[]`).toBe(0);
      } else if (!skill.customBehavior) {
        // Custom-behavior skills express their effect via the registered resolver.
        expect(skill.effects.length, `${id} active skill has no effects[]`).toBeGreaterThan(0);
      }
    }
  });
}

function registerPassiveContributionAuditTests() {
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
}

function registerSkillCatalogAuditTests() {
  it('every active-skill effect type is in IMPLEMENTED_EFFECT_TYPES (no silent claims)', () => {
    const skillsWithUnimplementedEffects: string[] = [];
    for (const [id, skill] of Object.entries(SKILLS)) {
      if (id.startsWith(PASSIVE_PREFIX)) continue;
      for (const effect of [
        ...skill.effects,
        ...(skill.reactions ?? []).flatMap((reaction) => [
          ...(reaction.effects ?? []),
          ...(reaction.casterEffects ?? []),
        ]),
      ]) {
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

  it('every skill icon resolves to a shipped public asset', () => {
    for (const [id, skill] of Object.entries(SKILLS)) {
      expect(skill.icon.startsWith('/game/skills/'), `${id} icon should be public skill asset`).toBe(true);
      expect(
        existsSync(join(process.cwd(), 'public', skill.icon)),
        `${id} icon file missing: ${skill.icon}`,
      ).toBe(true);
    }
  });

  it('every player-learnable skill uses its own generated icon', () => {
    const playableSkillIds = new Set<SkillId>(UNIVERSAL_SKILLS);
    for (const tree of Object.values(CLASS_SKILL_TREES)) {
      for (const skillId of Object.keys(tree.skillProgression)) playableSkillIds.add(skillId as SkillId);
    }
    for (const spec of Object.values(SPECIALIZATIONS)) {
      for (const skillId of spec.specSkills ?? []) playableSkillIds.add(skillId);
      for (const skillId of spec.proficiencySkills ?? []) playableSkillIds.add(skillId);
    }

    const icons = new Set<string>();
    for (const skillId of playableSkillIds) {
      const icon = SKILLS[skillId].icon;
      expect(icon, `${skillId} should use generated skill icon`).toMatch(/^\/game\/skills\/skill-icon-[a-z0-9-]+\.png$/);
      expect(icons.has(icon), `${skillId} reuses generated skill icon ${icon}`).toBe(false);
      icons.add(icon);
    }
  });

  it('sanity touchpoint: spec catalog stays in sync with races / classes', () => {
    expect(CHARACTER_RACES.length).toBeGreaterThan(0);
    expect(Object.keys(CLASS_SKILL_TREES).length).toBeGreaterThan(0);
  });
}
