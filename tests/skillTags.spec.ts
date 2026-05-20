import { describe, expect, it } from 'vitest';
import { SKILLS, SKILL_IDS } from '../packages/content/skills';
import { getAllSkillTags, getSkillTags } from '../packages/content/skillTags';

// §49/M3 PR014 — descriptive skill tags. Tags are derived from the
// SkillDef shape with per-skill overrides for cases where inference
// would produce the wrong answer. These tests pin the resolved set
// so a future skill change can't silently re-categorize an existing
// skill.

describe('skill tag resolution', () => {
  it('resolves a tag set for every skill id', () => {
    const all = getAllSkillTags();
    for (const id of SKILL_IDS) {
      expect(all[id], `missing tag set for ${id}`).toBeDefined();
    }
  });

  it('passive skills resolve to role=passive and targetMode=passive', () => {
    for (const id of SKILL_IDS.filter((s) => s.startsWith('passive_'))) {
      const tags = getSkillTags(SKILLS[id]);
      expect(tags.role, `${id} should be role=passive`).toBe('passive');
      expect(tags.targetMode, `${id} should be targetMode=passive`).toBe('passive');
    }
  });

  it('fireball stays a damage skill in the fire school', () => {
    const t = getSkillTags(SKILLS.fireball);
    expect(t.role).toBe('damage');
    expect(t.school).toBe('fire');
    expect(t.targetMode).toBe('enemy');
    expect(t.pveUse).toContain('single-target');
  });

  it('petrify is reclassified as control via override (token damage ignored)', () => {
    const t = getSkillTags(SKILLS.petrify);
    expect(t.role).toBe('control');
    expect(t.pveUse).toEqual(['single-target', 'boss']);
  });

  it('escape is mobility + self target via override', () => {
    const t = getSkillTags(SKILLS.escape);
    expect(t.role).toBe('mobility');
    expect(t.targetMode).toBe('self');
    expect(t.pveUse).toEqual(['escape']);
  });

  it('holyLight is a heal targeted at self by override', () => {
    const t = getSkillTags(SKILLS.holyLight);
    expect(t.role).toBe('heal');
    expect(t.school).toBe('holy');
    expect(t.targetMode).toBe('self');
  });

  it('shieldWall is a tank cooldown', () => {
    const t = getSkillTags(SKILLS.shieldWall);
    expect(t.role).toBe('tank');
    expect(t.targetMode).toBe('self');
  });

  it('volley is pack-clear AoE damage', () => {
    const t = getSkillTags(SKILLS.volley);
    expect(t.role).toBe('damage');
    expect(t.pveUse).toContain('pack');
  });

  it('every damage skill resolves to a scaling stat', () => {
    for (const id of SKILL_IDS) {
      const skill = SKILLS[id];
      if (skill.dmg && skill.dmg > 0) {
        const t = getSkillTags(skill);
        expect(t.scalingStat, `${id} should resolve a scalingStat`).toBeDefined();
      }
    }
  });
});
