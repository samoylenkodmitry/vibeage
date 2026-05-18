import { describe, expect, it } from 'vitest';
import { classifySkill, SKILLS } from '../packages/content/skills';

describe('skill alignment classification', () => {
  it('basicAttack / damaging skills are harmful', () => {
    expect(classifySkill(SKILLS.basicAttack.effects)).toBe('harmful');
    expect(classifySkill(SKILLS.fireball.effects)).toBe('harmful');
    expect(classifySkill(SKILLS.iceBolt.effects)).toBe('harmful');
    expect(classifySkill(SKILLS.poisonBlade.effects)).toBe('harmful');
  });

  it('heal / shield / bless / evade / dispel are beneficial', () => {
    expect(classifySkill(SKILLS.holyLight.effects)).toBe('beneficial');
    expect(classifySkill(SKILLS.shieldWall.effects)).toBe('beneficial');
    expect(classifySkill(SKILLS.bless.effects)).toBe('beneficial');
    expect(classifySkill(SKILLS.evade.effects)).toBe('beneficial');
    expect(classifySkill(SKILLS.dispel.effects)).toBe('beneficial');
    expect(classifySkill(SKILLS.divineShield.effects)).toBe('beneficial');
  });

  it('escape / teleport-style is neutral', () => {
    expect(classifySkill(SKILLS.escape.effects)).toBe('neutral');
  });

  it('mixed-bag heuristic: any harmful effect makes the skill harmful', () => {
    expect(classifySkill([{ type: 'damage' }, { type: 'heal' }])).toBe('harmful');
    expect(classifySkill([{ type: 'heal' }, { type: 'shield' }])).toBe('beneficial');
    expect(classifySkill([])).toBe('neutral');
  });
});
