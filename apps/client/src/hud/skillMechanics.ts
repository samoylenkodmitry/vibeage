import { skillMechanicLabels } from '../../../../packages/content/skillMechanics';
import type { SkillDef } from '../../../../packages/content/skills';
import type { SkillOffense } from '../../../../packages/content/skillTags';
import type { SkillReaction } from '../../../../packages/content/skillReactions';

/**
 * Human-readable lines for a skill's offensive modifiers (roadmap
 * B9–B12) so the tooltip / skill-tree detail show what a skill
 * actually does, not just its base damage. Empty when the skill has
 * no offense flags. Numbers come straight from the skill def.
 */
export function describeOffense(offense: SkillOffense | undefined): string[] {
  if (!offense) return [];
  const out: string[] = [];
  if (offense.executeBonus) {
    out.push(`Execute: up to +${Math.round(offense.executeBonus * 100)}% as the target's HP drops`);
  }
  if (offense.bonusCritChance) {
    out.push(`+${Math.round(offense.bonusCritChance * 100)}% crit chance`);
  }
  if (offense.bonusCritMult) {
    out.push(`+${offense.bonusCritMult.toFixed(1)}× crit damage`);
  }
  if (offense.lifestealPct) {
    out.push(`Lifesteal: heals ${Math.round(offense.lifestealPct * 100)}% of damage dealt`);
  }
  if (offense.armorPen) {
    out.push(`Ignores ${Math.round(offense.armorPen)} of the target's defense`);
  }
  return out;
}

export function describeReactions(reactions: readonly SkillReaction[] | undefined): string[] {
  return reactions?.map((reaction) => reaction.description) ?? [];
}

export function describeSkillPlayPattern(skill: SkillDef): string[] {
  const lines: string[] = [];
  const labels = skillMechanicLabels(skill, 4);
  if (labels.length > 0) lines.push(`Mechanics: ${labels.join(' + ')}`);
  if (skill.pveUse?.length) lines.push(`Best used for: ${skill.pveUse.join(', ')}`);
  if (skill.role && skill.targetMode) lines.push(`${skill.role} · ${skill.targetMode}`);
  return lines;
}
