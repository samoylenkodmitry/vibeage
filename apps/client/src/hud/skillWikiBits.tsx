import type { SkillDef } from '../../../../packages/content/skills';
import { skillUsers, type SkillUserKind } from '../../../../packages/content/skillUsers';
import type { WikiNav } from './WikiPanel';

/**
 * Wiki helpers for the unified ability schema (docs/ABILITY_SYSTEM.md):
 * a one-line geometry/delivery summary, and the "used by" chips that link
 * a skill to every class / spec / mob / boss that casts it (§3).
 */

/** Short human label for a skill's shape + delivery, or null if plain single-target. */
export function abilityDeliveryLabel(skill: SkillDef): string | null {
  const parts: string[] = [];
  const s = skill.shape;
  if (s && s.kind !== 'single') {
    if (s.kind === 'circle') parts.push(`Circle r${s.radius}`);
    else if (s.kind === 'donut') parts.push(`Ring ${s.innerRadius}–${s.outerRadius}`);
    else if (s.kind === 'cone') parts.push(`Cone ${s.length}u / ${s.halfAngleDeg * 2}°`);
    if (s.anchor === 'target') parts.push('on target');
  }
  if (skill.affects && skill.affects !== 'enemies') parts.push(`hits ${skill.affects}`);
  if (skill.telegraph) parts.push(`telegraphed ${(skill.telegraph.windUpMs / 1000).toFixed(1)}s`);
  if (skill.blink) parts.push(`blink ${skill.blink.offset}u`);
  if (skill.summon) parts.push(`summons ${skill.summon.count}× ${skill.summon.type}`);
  if (skill.damageMult && skill.damageMult !== 1) parts.push(`${skill.damageMult}× damage`);
  return parts.length ? parts.join(' · ') : null;
}

const TAB_FOR: Record<SkillUserKind, Parameters<WikiNav>[0]> = {
  class: 'classes', spec: 'specs', mob: 'mobs', boss: 'bosses',
};

/** "Used by" chips — click to jump to the class / spec / mob / boss. */
export function SkillUsedBy({ skill, navigate }: { skill: SkillDef; navigate: WikiNav }) {
  const users = skillUsers(skill.id);
  if (users.length === 0) return null;
  return (
    <small className="wiki-row-footer">
      Used by:{' '}
      {users.map((u, i) => (
        <span key={`${u.kind}:${u.id}`}>
          {i > 0 && ' '}
          <button
            type="button"
            className={`wiki-user-chip wiki-user-${u.kind}`}
            onClick={() => navigate(TAB_FOR[u.kind], u.id)}
            title={`${u.kind}: ${u.name}`}
          >
            {u.name}
          </button>
        </span>
      ))}
    </small>
  );
}
