import { SKILLS, type SkillDef } from '../../../../packages/content/skills';
import type { SpellElement, SpellForm, SpellMechanic } from './spellFx';

export type SkillTheme = {
  core: string;
  glow: string;
  accent: string;
  shape: 'sphere' | 'crystal' | 'stone';
  element?: SpellElement;
  form?: SpellForm;
  mechanic?: SpellMechanic;
};

const DEFAULT_SKILL_THEME: SkillTheme = {
  core: '#c4b5fd',
  glow: '#8b5cf6',
  accent: '#a78bfa',
  shape: 'sphere',
  element: 'arcane',
  form: 'bolt',
};

const SCHOOL_THEMES: Record<string, SkillTheme> = {
  fire: { core: '#ff6a1a', glow: '#f97316', accent: '#facc15', shape: 'sphere', element: 'fire', form: 'comet' },
  ice: { core: '#bfdbfe', glow: '#60a5fa', accent: '#67e8f9', shape: 'crystal', element: 'ice', form: 'shard' },
  water: { core: '#7dd3fc', glow: '#38bdf8', accent: '#8de9d7', shape: 'sphere' },
  holy: { core: '#fef9c3', glow: '#fef08a', accent: '#fff7ad', shape: 'sphere', element: 'holy' },
  poison: { core: '#a7f3d0', glow: '#10b981', accent: '#86efac', shape: 'crystal', element: 'poison', form: 'orb' },
  shadow: { core: '#a78bfa', glow: '#6d28d9', accent: '#22d3ee', shape: 'sphere', element: 'arcane', form: 'orb' },
  arcane: DEFAULT_SKILL_THEME,
  physical: { core: '#d1fae5', glow: '#22c55e', accent: '#bbf7d0', shape: 'crystal', form: 'arrow' },
};

const SKILL_THEME_OVERRIDES: Partial<Record<string, SkillTheme>> = {
  fireball: { ...SCHOOL_THEMES.fire, mechanic: 'arc' },
  iceBolt: { ...SCHOOL_THEMES.ice, mechanic: 'spiral' },
  waterSplash: { ...SCHOOL_THEMES.water, mechanic: 'deluge' },
  petrify: { core: '#a8a29e', glow: '#d6d3d1', accent: '#facc15', shape: 'stone', mechanic: 'erupt' },
  smite: { ...SCHOOL_THEMES.holy, mechanic: 'strike' },
  arrowShot: { ...SCHOOL_THEMES.physical, mechanic: 'lance' },
  volley: { ...SCHOOL_THEMES.physical, mechanic: 'lance' },
  poisonBlade: { ...SCHOOL_THEMES.poison, mechanic: 'arc' },
  holyLight: { ...SCHOOL_THEMES.holy, mechanic: 'strike' },
  arcane_blast: { ...SCHOOL_THEMES.arcane, mechanic: 'spiral' },
  time_sphere: { core: '#ddd6fe', glow: '#8b5cf6', accent: '#67e8f9', shape: 'sphere', element: 'arcane', form: 'orb' },
  meteor: { ...SCHOOL_THEMES.fire, mechanic: 'meteor' },
  inferno_aura: { ...SCHOOL_THEMES.fire, mechanic: 'inferno' },
  greater_heal: { ...SCHOOL_THEMES.holy, mechanic: 'strike' },
  mass_heal: { ...SCHOOL_THEMES.holy, mechanic: 'strike' },
  sacred_pulse: { ...SCHOOL_THEMES.holy, mechanic: 'strike' },
  mobFirebolt: { ...SCHOOL_THEMES.fire, mechanic: 'arc' },
  mobFrostbolt: { ...SCHOOL_THEMES.ice, mechanic: 'spiral' },
  mobPoisonBite: { ...SCHOOL_THEMES.poison, mechanic: 'arc' },
};

export function skillThemeFor(skillId: string): SkillTheme {
  const override = SKILL_THEME_OVERRIDES[skillId];
  if (override) return override;
  const skill = Object.prototype.hasOwnProperty.call(SKILLS, skillId)
    ? SKILLS[skillId as keyof typeof SKILLS]
    : undefined;
  if (!skill) return DEFAULT_SKILL_THEME;
  const school = skill.damageElement ?? skill.school ?? (skill.kind === 'physical' ? 'physical' : skill.kind);
  const base = SCHOOL_THEMES[school] ?? DEFAULT_SKILL_THEME;
  return { ...base, mechanic: deriveMechanic(skill), form: deriveForm(skill, base.form) };
}

function deriveMechanic(skill: SkillDef): SpellMechanic {
  const behavior = skill.customBehavior ?? '';
  if (/(swap|step|lunge|leap|charge)/i.test(behavior)) return 'spiral';
  if (/(seal|zone|halo|mine|net|rend|bloom|magnet|relay|gate|lattice|prism)/i.test(behavior)) return 'nova';
  if (skill.cat === 'aura' || skill.targetMode?.startsWith('area')) return 'nova';
  if (skill.cat === 'projectile' || skill.projectile) return skill.kind === 'physical' ? 'lance' : 'arc';
  if (skill.blink || skill.swap) return 'spiral';
  if (skill.castMs > 0 && skill.kind === 'magical') return 'strike';
  return 'projectile';
}

function deriveForm(skill: SkillDef, fallback: SpellForm | undefined): SpellForm | undefined {
  if (skill.kind === 'physical') return skill.range && skill.range > 10 ? 'arrow' : 'shard';
  if (skill.damageElement === 'fire' || skill.school === 'fire') return 'comet';
  return fallback;
}
