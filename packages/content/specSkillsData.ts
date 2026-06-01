import type { SkillDef, SkillId } from './skills.js';

/**
 * Spec + proficiency skill catalog, split out from skills.ts to keep
 * that file under the 700-line maintainability gate. Spread into
 * SKILLS in skills.ts. Each id is referenced by exactly one
 * SPECIALIZATIONS[*].specSkills or .proficiencySkills entry; the
 * engine gate (canPlayerLearnSkill + classifyLearnRejection) reads
 * SPECIALIZATIONS to decide eligibility — there is no per-skill
 * code branch.
 */
export const SPEC_AND_PROFICIENCY_SKILLS: Partial<Record<SkillId, SkillDef>> = {
  // ---- Spec skills (Lv 20 unlock) ----
  arcane_blast: {
    id: 'arcane_blast', name: 'Arcane Blast',
    description: 'Concentrated arcane bolt; long range, hits hard.',
    icon: '/game/skills/skill_fireball.png', cat: 'projectile', kind: 'magical',
    manaCost: 35, castMs: 900, cooldownMs: 6000, dmg: 240, range: 24,
    levelRequired: 20, requiresTarget: true,
    effects: [{ type: 'damage', value: 240 }],
  },
  meteor: {
    id: 'meteor', name: 'Meteor',
    description: 'Calls a meteor from the sky, burning the area.',
    icon: '/game/skills/skill_fireball.png', cat: 'aura', kind: 'magical',
    damageElement: 'fire',
    manaCost: 55, castMs: 1400, cooldownMs: 15000, dmg: 320, range: 18, area: 4,
    levelRequired: 20, requiresTarget: false,
    effects: [{ type: 'damage', value: 320 }, { type: 'burn', value: 4, durationMs: 6000 }],
  },
  rage: {
    id: 'rage', name: 'Rage',
    description: 'Surge of fury: hit harder for a short window.',
    icon: '/game/skills/skill_melee.svg', cat: 'instant', kind: 'utility',
    manaCost: 20, castMs: 0, cooldownMs: 30000, levelRequired: 20, isBlocking: false,
    effects: [{ type: 'bless', value: 25, durationMs: 10000 }],
  },
  execute: {
    id: 'execute', name: 'Execute',
    description: 'Finishing blow against a wounded target.',
    icon: '/game/skills/skill_melee.svg', cat: 'instant', kind: 'physical',
    manaCost: 25, castMs: 400, cooldownMs: 8000, dmg: 280, range: 4,
    levelRequired: 20, requiresTarget: true,
    // B9 — up to +150% damage as the target's HP drops to 0.
    offense: { executeBonus: 1.5 },
    effects: [{ type: 'damage', value: 280 }],
  },
  greater_heal: {
    id: 'greater_heal', name: 'Greater Heal',
    description: 'A potent restoration spell.',
    icon: '/game/skills/skill_holyLight.svg', cat: 'instant', kind: 'utility',
    manaCost: 40, castMs: 1500, cooldownMs: 8000, levelRequired: 20,
    effects: [{ type: 'heal', value: 220 }],
  },
  empower: {
    id: 'empower', name: 'Empower',
    description: 'Stack a damage-boost buff on the caster.',
    icon: '/game/skills/skill_holyLight.svg', cat: 'instant', kind: 'utility',
    manaCost: 30, castMs: 600, cooldownMs: 20000, levelRequired: 20,
    effects: [{ type: 'bless', value: 20, durationMs: 12000 }],
  },
  snipe: {
    id: 'snipe', name: 'Snipe',
    description: 'A precise long-range arrow shot.',
    icon: '/game/skills/skill_melee.svg', cat: 'projectile', kind: 'physical',
    manaCost: 25, castMs: 1100, cooldownMs: 9000, dmg: 280, range: 32,
    levelRequired: 20, requiresTarget: true,
    effects: [{ type: 'damage', value: 280 }],
  },
  silent_step: {
    id: 'silent_step', name: 'Silent Step',
    description: 'Brief invisibility for repositioning.',
    icon: '/game/skills/skill_melee.svg', cat: 'instant', kind: 'utility',
    manaCost: 30, castMs: 0, cooldownMs: 45000, levelRequired: 20, isBlocking: false,
    // selfTarget so the stealth/aggroReset always land on the caster, never
    // a targeted enemy (matches Vanish; guards the with-target cast path).
    selfTarget: true,
    // C16 — drop current chasers too, so the invisibility actually lets
    // you reposition (invisible alone doesn't clear existing threat).
    effects: [{ type: 'invisible', value: 1, durationMs: 8000 }, { type: 'aggroReset', value: 1 }],
  },
  holy_shield: {
    id: 'holy_shield', name: 'Holy Shield',
    description: 'A radiant ward that absorbs damage.',
    icon: '/game/skills/skill_holyLight.svg', cat: 'instant', kind: 'utility',
    manaCost: 35, castMs: 500, cooldownMs: 25000, levelRequired: 20,
    effects: [{ type: 'shield', value: 250, durationMs: 12000 }],
  },
  shadow_strike: {
    id: 'shadow_strike', name: 'Shadow Strike',
    description: 'Blink through the target and strike from the far side, bypassing normal defenses.',
    icon: '/game/skills/skill_melee.svg', cat: 'instant', kind: 'physical',
    manaCost: 25, castMs: 500, cooldownMs: 10000, dmg: 240, range: 4,
    levelRequired: 20, requiresTarget: true,
    blink: { offset: 1.5 },
    // B12 — ignores up to 500 P.Def/M.Def (most armor).
    offense: { armorPen: 500 },
    effects: [{ type: 'damage', value: 240 }],
  },
  phoenix_ward: {
    id: 'phoenix_ward', name: 'Phoenix Ward',
    description: 'Flame-laced shield that absorbs damage.',
    icon: '/game/skills/skill_holyLight.svg', cat: 'instant', kind: 'utility',
    manaCost: 35, castMs: 600, cooldownMs: 30000, levelRequired: 20,
    effects: [{ type: 'shield', value: 280, durationMs: 14000 }],
  },
  sacred_pulse: {
    id: 'sacred_pulse', name: 'Sacred Pulse',
    description: 'A burst of radiance that heals nearby allies.',
    icon: '/game/skills/skill_holyLight.svg', cat: 'aura', kind: 'utility',
    manaCost: 40, castMs: 800, cooldownMs: 18000, area: 6, levelRequired: 20,
    effects: [{ type: 'heal', value: 160 }],
  },
  lucky_strike: {
    id: 'lucky_strike', name: 'Lucky Strike',
    description: 'A precise attack with a chance to crit big.',
    icon: '/game/skills/skill_melee.svg', cat: 'instant', kind: 'physical',
    manaCost: 22, castMs: 300, cooldownMs: 12000, dmg: 220, range: 4,
    levelRequired: 20, requiresTarget: true,
    // B10 — +50% crit chance and a bigger crit on this hit.
    offense: { bonusCritChance: 0.5, bonusCritMult: 0.5 },
    effects: [{ type: 'damage', value: 220 }],
  },
  wind_dash: {
    id: 'wind_dash', name: 'Wind Dash',
    description: 'A burst of speed that breaks pursuit.',
    icon: '/game/skills/skill_melee.svg', cat: 'instant', kind: 'utility',
    manaCost: 18, castMs: 0, cooldownMs: 20000, levelRequired: 20, isBlocking: false,
    // §SKILL-ENGINE B7 — actually a speed burst that drops chasers
    // (was an `evasion` dodge buff, unrelated to its text).
    effects: [{ type: 'speed_boost', value: 40, durationMs: 6000 }, { type: 'aggroReset', value: 1 }],
  },
  // ---- Proficiency skills (Lv 40 unlock) ----
  arcane_supremacy: {
    id: 'arcane_supremacy', name: 'Arcane Supremacy',
    description: 'Devastating spell that spends banked Arcane Charges for overflow burst.',
    icon: '/game/skills/skill_fireball.png', cat: 'projectile', kind: 'magical',
    manaCost: 80, castMs: 1800, cooldownMs: 25000, dmg: 520, range: 28,
    levelRequired: 40, requiresTarget: true,
    effects: [{ type: 'damage', value: 520 }],
  },
  time_sphere: {
    id: 'time_sphere', name: 'Time Sphere',
    description: 'Collapse time around the target: every combatant caught inside is stopped, except the caster.',
    icon: '/game/skills/skill-icon-arcane-supremacy.png', cat: 'aura', kind: 'utility',
    manaCost: 75, castMs: 700, cooldownMs: 45000, range: 20, area: 5,
    levelRequired: 40, requiresTarget: true,
    role: 'control', school: 'arcane', scalingStat: 'int', targetMode: 'enemy', pveUse: ['pack', 'opener'],
    shape: { kind: 'circle', radius: 5, anchor: 'target' },
    affects: 'all',
    effects: [{ type: 'timeStop', value: 1, durationMs: 3500 }],
  },
  inferno_aura: {
    id: 'inferno_aura', name: 'Inferno Aura',
    description: 'A roaring fire surrounds you, burning everything near.',
    icon: '/game/skills/skill_fireball.png', cat: 'aura', kind: 'magical',
    damageElement: 'fire',
    manaCost: 60, castMs: 800, cooldownMs: 30000, area: 5, levelRequired: 40,
    effects: [{ type: 'burn', value: 6, durationMs: 12000 }],
  },
  blood_frenzy: {
    id: 'blood_frenzy', name: 'Blood Frenzy',
    description: 'Push your body past the limit; massive damage spike.',
    icon: '/game/skills/skill_melee.svg', cat: 'instant', kind: 'utility',
    manaCost: 30, castMs: 0, cooldownMs: 60000, levelRequired: 40, isBlocking: false,
    effects: [{ type: 'bless', value: 50, durationMs: 12000 }],
  },
  killing_strike: {
    id: 'killing_strike', name: 'Killing Strike',
    description: 'A perfect finishing blow.',
    icon: '/game/skills/skill_melee.svg', cat: 'instant', kind: 'physical',
    manaCost: 40, castMs: 500, cooldownMs: 18000, dmg: 520, range: 4,
    levelRequired: 40, requiresTarget: true,
    effects: [{ type: 'damage', value: 520 }],
  },
  mass_heal: {
    id: 'mass_heal', name: 'Mass Heal',
    description: 'Restore HP to everyone around you.',
    icon: '/game/skills/skill_holyLight.svg', cat: 'aura', kind: 'utility',
    manaCost: 70, castMs: 1500, cooldownMs: 25000, area: 8, levelRequired: 40,
    effects: [{ type: 'heal', value: 280 }],
  },
  group_bless: {
    id: 'group_bless', name: 'Group Bless',
    description: 'Stronger, longer bless that radiates to allies.',
    icon: '/game/skills/skill_holyLight.svg', cat: 'aura', kind: 'utility',
    manaCost: 60, castMs: 1200, cooldownMs: 40000, area: 8, levelRequired: 40,
    effects: [{ type: 'bless', value: 35, durationMs: 20000 }],
  },
  aimed_volley: {
    id: 'aimed_volley', name: 'Aimed Volley',
    description: 'A perfectly placed barrage of arrows that cashes out Marked targets.',
    icon: '/game/skills/skill_melee.svg', cat: 'projectile', kind: 'physical',
    manaCost: 55, castMs: 1500, cooldownMs: 25000, dmg: 380, range: 30, area: 4,
    levelRequired: 40, requiresTarget: false,
    effects: [{ type: 'damage', value: 380 }],
  },
  shadow_arrow: {
    id: 'shadow_arrow', name: 'Shadow Arrow',
    description: 'A piercing dark arrow that ignores most defenses.',
    icon: '/game/skills/skill_melee.svg', cat: 'projectile', kind: 'physical',
    manaCost: 45, castMs: 800, cooldownMs: 12000, dmg: 360, range: 28,
    levelRequired: 40, requiresTarget: true,
    // B12 — ignores up to 500 P.Def/M.Def (most armor).
    offense: { armorPen: 500 },
    effects: [{ type: 'damage', value: 360 }],
  },
  divine_taunt: {
    id: 'divine_taunt', name: 'Divine Taunt',
    description: 'Compel every enemy nearby to attack you.',
    icon: '/game/skills/skill_holyLight.svg', cat: 'aura', kind: 'utility',
    manaCost: 50, castMs: 0, cooldownMs: 30000, area: 6, levelRequired: 40, isBlocking: false,
    effects: [{ type: 'taunt', value: 1, durationMs: 8000 }],
  },
  soul_eater: {
    id: 'soul_eater', name: 'Soul Eater',
    description: 'Drain life from your target.',
    icon: '/game/skills/skill_melee.svg', cat: 'instant', kind: 'magical',
    manaCost: 50, castMs: 600, cooldownMs: 15000, dmg: 280, range: 8,
    levelRequired: 40, requiresTarget: true,
    // B11 — heals the caster for 50% of the damage dealt.
    offense: { lifestealPct: 0.5 },
    effects: [{ type: 'damage', value: 280 }],
  },
  spectral_guard: {
    id: 'spectral_guard', name: 'Spectral Guard',
    description: 'Raise a vengeful guard that reflects a share of incoming damage back at attackers.',
    icon: '/game/skills/skill-icon-holy-shield.png', cat: 'aura', kind: 'utility',
    manaCost: 45, castMs: 0, cooldownMs: 35000, levelRequired: 40, isBlocking: false,
    selfTarget: true,
    role: 'tank', school: 'shadow', scalingStat: 'con', targetMode: 'self', pveUse: ['sustain', 'boss'],
    effects: [{ type: 'damageReflect', value: 35, durationMs: 8000 }],
  },
  rebirth: {
    id: 'rebirth', name: 'Rebirth',
    description: 'A massive shield that briefly makes the caster nearly invulnerable.',
    icon: '/game/skills/skill_holyLight.svg', cat: 'instant', kind: 'utility',
    manaCost: 80, castMs: 1000, cooldownMs: 120000, levelRequired: 40,
    effects: [{ type: 'shield', value: 800, durationMs: 8000 }],
  },
  sacred_aura: {
    id: 'sacred_aura', name: 'Sacred Aura',
    description: 'A constant pulse of healing to nearby allies.',
    icon: '/game/skills/skill_holyLight.svg', cat: 'aura', kind: 'utility',
    manaCost: 70, castMs: 1500, cooldownMs: 60000, area: 8, levelRequired: 40,
    effects: [{ type: 'heal', value: 200 }],
  },
  treasure_sense: {
    id: 'treasure_sense', name: 'Treasure Sense',
    description: 'Reveals loot drops at a glance.',
    icon: '/game/skills/skill_melee.svg', cat: 'instant', kind: 'utility',
    manaCost: 20, castMs: 0, cooldownMs: 60000, levelRequired: 40, isBlocking: false,
    // B8 — actually reveals ground loot (was an unrelated evasion buff).
    effects: [{ type: 'reveal_loot', value: 1, durationMs: 30000 }],
  },
  stalking_arrow: {
    id: 'stalking_arrow', name: 'Stalking Arrow',
    description: 'A relentless arrow that slows the target.',
    icon: '/game/skills/skill_melee.svg', cat: 'projectile', kind: 'physical',
    manaCost: 40, castMs: 700, cooldownMs: 12000, dmg: 320, range: 26,
    levelRequired: 40, requiresTarget: true,
    effects: [{ type: 'damage', value: 320 }, { type: 'slow', value: 40, durationMs: 5000 }],
  },
};
