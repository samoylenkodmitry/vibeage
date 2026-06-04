import type { SkillDef, SkillEffectType } from './skills.js';

const EFFECT_MECHANICS: Record<SkillEffectType, string> = {
  damage: 'Damage',
  heal: 'Heal',
  stun: 'Stun',
  slow: 'Slow',
  dot: 'Bleed',
  burn: 'Burn',
  poison: 'Poison',
  waterWeakness: 'Weakness',
  marked: 'Mark',
  freeze: 'Freeze',
  timeStop: 'Time Stop',
  shield: 'Shield',
  damageReflect: 'Reflect',
  bless: 'Buff',
  arcaneCharge: 'Charge',
  dispel: 'Cleanse',
  taunt: 'Taunt',
  silence: 'Silence',
  knockback: 'Knockback',
  evasion: 'Evade',
  invisible: 'Stealth',
  speed_boost: 'Haste',
  attackSpeed: 'Attack Speed',
  reveal_loot: 'Loot Sense',
  aggroReset: 'Drop Aggro',
  teleport: 'Teleport',
};

const CUSTOM_MECHANICS: Record<string, readonly string[]> = {
  rewindMark: ['Rewind', 'Recover'],
  portalPair: ['Portal', 'Ally Move'],
  gravityWell: ['Pull', 'Zone', 'Slow'],
  mirrorSpell: ['Reflect', 'Ward'],
  soulLink: ['Link', 'Echo Damage'],
  phaseStep: ['Blink', 'Afterimage'],
  projectileCapture: ['Capture', 'Reflect'],
  terrainSigil: ['Trap', 'Root', 'Zone'],
  puppetMastery: ['Control', 'Drop Aggro'],
  momentumStrike: ['Knockback', 'Speed Damage'],
  delayedFate: ['Delayed Damage'],
  cloneSwap: ['Illusion', 'Blink'],
  magmaChain: ['Hook', 'Pull', 'Burn'],
  duelistLunge: ['Blink', 'Mark', 'Cleave'],
  phoenixLeap: ['Leap', 'Shield', 'Burn'],
  aegisRelay: ['Ally Pull', 'Heal', 'Shield'],
  phasePrison: ['Pull', 'Root', 'Silence'],
  tripwireVolley: ['Trap', 'Root', 'Knockback'],
  guardianHook: ['Hook', 'Taunt', 'Shield'],
  lifelineSwap: ['Ally Swap', 'Heal', 'Shield'],
  combustionBloom: ['Burn Detonate', 'Zone', 'Knockback'],
  bloodMagnet: ['Pull', 'Bleed', 'Attack Speed'],
  echoingBenediction: ['Chain Heal', 'Shield', 'Buff'],
  umbraMine: ['Trap', 'Decoy', 'Poison'],
  vengeanceTether: ['Tether', 'Taunt', 'Reflect'],
  sunbreakCharge: ['Charge', 'Burn', 'Ally Heal'],
  tidalBarrier: ['Cleanse', 'Knockback', 'Shield'],
  jackpotSnare: ['Trap', 'Mark', 'Loot Sense'],
  razorwindStep: ['Blink', 'Bleed', 'Poison Spread'],
  warbandHowl: ['Pack Rally'],
};

export function skillMechanicLabels(skill: SkillDef, limit = 5): string[] {
  const labels = new Set<string>();
  for (const effect of skill.effects ?? []) {
    const label = EFFECT_MECHANICS[effect.type];
    if (label) labels.add(label);
  }
  if (skill.projectile) labels.add(skill.projectile.pierce ? 'Pierce' : 'Projectile');
  if (skill.blink) labels.add('Blink');
  if (skill.swap) labels.add('Swap');
  if (skill.summon) labels.add('Summon');
  if (skill.shape?.kind === 'donut') labels.add('Ring Zone');
  else if (skill.shape || (skill.area ?? 0) > 0) labels.add('Zone');
  for (const label of CUSTOM_MECHANICS[skill.customBehavior ?? ''] ?? []) labels.add(label);
  if (skill.offense?.executeBonus) labels.add('Execute');
  if (skill.offense?.lifestealPct) labels.add('Lifesteal');
  if (skill.offense?.armorPen) labels.add('Armor Pen');
  return [...labels].slice(0, limit);
}

export function skillMechanicSummary(skills: readonly SkillDef[], limit = 6): string {
  const labels = new Set<string>();
  for (const skill of skills) {
    for (const label of skillMechanicLabels(skill)) labels.add(label);
    if (labels.size >= limit) break;
  }
  return [...labels].slice(0, limit).join(', ');
}
