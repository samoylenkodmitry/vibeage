import { describe, expect, it } from 'vitest';
import { CLASS_SKILL_TREES } from '../packages/content/classes';
import { SKILLS, type SkillId } from '../packages/content/skills';

/**
 * Authoring guardrails for every class's `skillProgression` map.
 *
 * If any of these fail, a designer added a skill (or a prereq edge)
 * that would let a character either get stuck (cycle), claim a skill
 * they can't actually unlock (orphan prereq), or learn something
 * before its prerequisite is reachable (level inversion).
 */

function detectCycle(
  rootSkill: SkillId,
  progression: ReturnType<typeof prereqMap>,
  visited: Set<SkillId>,
): { cycle: SkillId[] } | null {
  const stack: SkillId[] = [];
  const visiting = new Set<SkillId>();

  const visit = (skill: SkillId): SkillId[] | null => {
    if (visiting.has(skill)) {
      const start = stack.indexOf(skill);
      return start >= 0 ? [...stack.slice(start), skill] : [skill];
    }
    // Already proven cycle-free from a prior root — skip re-traversal.
    // Together with `visiting`, this gives O(V+E) instead of potentially
    // exponential on a denser graph.
    if (visited.has(skill)) return null;

    visiting.add(skill);
    stack.push(skill);
    for (const prereq of progression.get(skill) ?? []) {
      const found = visit(prereq);
      if (found) return found;
    }
    visiting.delete(skill);
    visited.add(skill);
    stack.pop();
    return null;
  };

  const cycle = visit(rootSkill);
  return cycle ? { cycle } : null;
}

function prereqMap(progression: Record<string, { requiredSkills?: SkillId[] }>): Map<SkillId, SkillId[]> {
  const map = new Map<SkillId, SkillId[]>();
  for (const [skillId, req] of Object.entries(progression)) {
    if (req?.requiredSkills?.length) {
      map.set(skillId as SkillId, req.requiredSkills);
    }
  }
  return map;
}

describe('class skill prereq graphs', () => {
  for (const [className, tree] of Object.entries(CLASS_SKILL_TREES)) {
    describe(className, () => {
      const skills = Object.keys(tree.skillProgression) as SkillId[];
      const graph = prereqMap(tree.skillProgression as Record<string, { requiredSkills?: SkillId[] }>);

      it('every skillId in skillProgression exists in SKILLS', () => {
        for (const skillId of skills) {
          expect(SKILLS[skillId], `${className}.${skillId} is not in SKILLS catalog`).toBeDefined();
        }
      });

      it('every requiredSkill is also in this class\'s skill list (no orphan prereqs)', () => {
        const owned = new Set(skills);
        for (const [skill, prereqs] of graph) {
          for (const prereq of prereqs) {
            expect(
              owned.has(prereq),
              `${className}.${skill} requires ${prereq}, but ${prereq} is not in ${className}'s skillProgression`,
            ).toBe(true);
          }
        }
      });

      it('has no prereq cycles', () => {
        const visited = new Set<SkillId>();
        for (const skill of skills) {
          const cycle = detectCycle(skill, graph, visited);
          expect(cycle, `cycle detected starting at ${className}.${skill}: ${cycle?.cycle.join(' → ')}`).toBeNull();
        }
      });

      it('every required skill is at a lower level than the skill that requires it', () => {
        for (const [skill, prereqs] of graph) {
          const skillLevel = tree.skillProgression[skill]?.level ?? 0;
          for (const prereq of prereqs) {
            const prereqLevel = tree.skillProgression[prereq]?.level ?? 0;
            expect(
              prereqLevel,
              `${className}.${skill} (level ${skillLevel}) requires ${prereq} (level ${prereqLevel}) — prereq must be ≤ requirer level`,
            ).toBeLessThanOrEqual(skillLevel);
          }
        }
      });
    });
  }
});
