import type { SkillDef, SkillEffect, SkillEffectType, SkillId } from './skills.js';

export interface SkillReactionCondition {
  targetHasEffect?: SkillEffectType;
  casterHasEffect?: SkillEffectType;
  targetHealthBelowPct?: number;
  targetHealthAbovePct?: number;
  casterHealthBelowPct?: number;
  casterHealthAbovePct?: number;
}

/** Visual flavor of a combo reaction — picks the burst colour the client renders
 *  when the reaction fires. Data-driven so the wiki + client share one source. */
export type ReactionVfxFlavor = 'fire' | 'ice' | 'arcane' | 'poison' | 'blood' | 'holy' | 'shadow' | 'impact';

export const REACTION_VFX: Record<ReactionVfxFlavor, { color: string; accent: string }> = {
  fire: { color: '#ff6a1a', accent: '#facc15' },
  ice: { color: '#bfdbfe', accent: '#67e8f9' },
  arcane: { color: '#c4b5fd', accent: '#a78bfa' },
  poison: { color: '#a7f3d0', accent: '#10b981' },
  blood: { color: '#ef4444', accent: '#fca5a5' },
  holy: { color: '#fef9c3', accent: '#fde68a' },
  shadow: { color: '#8b5cf6', accent: '#4c1d95' },
  impact: { color: '#fde68a', accent: '#ffffff' },
};

export interface SkillReaction {
  id: string;
  description: string;
  /** Burst colour flavor shown when the reaction triggers. */
  flavor: ReactionVfxFlavor;
  condition: SkillReactionCondition;
  consumeTargetEffect?: SkillEffectType;
  consumeCasterEffect?: SkillEffectType;
  damageMultiplier?: number;
  damageMultiplierPerConsumedStack?: number;
  effects?: SkillEffect[];
  casterEffects?: SkillEffect[];
}

export const SKILL_REACTIONS: Partial<Record<SkillId, SkillReaction[]>> = {
  fireball: [{
    id: 'detonate_burn',
    description: 'Consumes existing Burn for +35% damage per stack.',
    flavor: 'fire',
    condition: { targetHasEffect: 'burn' },
    consumeTargetEffect: 'burn',
    damageMultiplierPerConsumedStack: 0.35,
  }],
  slash: [{
    id: 'hamstring_slow',
    description: 'Slowed targets take +20% damage and gain an extra Bleed stack.',
    flavor: 'blood',
    condition: { targetHasEffect: 'slow' },
    damageMultiplier: 1.2,
    effects: [{ type: 'dot', value: 5, durationMs: 6000 }],
  }],
  iceBolt: [{
    id: 'flash_freeze',
    description: 'Consumes Water Weakness to freeze the target for 1.2s, deal +20% damage, and bank an Arcane Charge.',
    flavor: 'ice',
    condition: { targetHasEffect: 'waterWeakness' },
    consumeTargetEffect: 'waterWeakness',
    damageMultiplier: 1.2,
    effects: [{ type: 'freeze', value: 1, durationMs: 1200 }],
    casterEffects: [{ type: 'arcaneCharge', value: 1, durationMs: 12000 }],
  }],
  bash: [{
    id: 'crack_bleed',
    description: 'Consumes Bleed for +25% damage per stack and extends the stun.',
    flavor: 'blood',
    condition: { targetHasEffect: 'dot' },
    consumeTargetEffect: 'dot',
    damageMultiplierPerConsumedStack: 0.25,
    effects: [{ type: 'stun', value: 1, durationMs: 2500 }],
  }],
  powerStrike: [{
    id: 'shatter_stun',
    description: 'Consumes Stun for +55% damage and leaves the target slowed.',
    flavor: 'impact',
    condition: { targetHasEffect: 'stun' },
    consumeTargetEffect: 'stun',
    damageMultiplier: 1.55,
    effects: [{ type: 'slow', value: 45, durationMs: 3500 }],
  }],
  smite: [{
    id: 'judgment_on_taunt',
    description: 'Deals +50% damage to Taunted enemies.',
    flavor: 'holy',
    condition: { targetHasEffect: 'taunt' },
    damageMultiplier: 1.5,
  }],
  arrowShot: [{
    id: 'pick_slow_target',
    description: 'Deals +25% damage to Slowed targets.',
    flavor: 'impact',
    condition: { targetHasEffect: 'slow' },
    damageMultiplier: 1.25,
  }],
  volley: [
    {
      id: 'pinning_fire',
      description: 'Slowed targets take +35% damage and are pinned briefly.',
      flavor: 'fire',
      condition: { targetHasEffect: 'slow' },
      damageMultiplier: 1.35,
      effects: [{ type: 'stun', value: 1, durationMs: 800 }],
    },
    {
      id: 'marked_barrage',
      description: 'Consumes Marked for +30% damage and a longer slow, creating a Snipe window.',
      flavor: 'impact',
      condition: { targetHasEffect: 'marked' },
      consumeTargetEffect: 'marked',
      damageMultiplier: 1.3,
      effects: [{ type: 'slow', value: 45, durationMs: 4500 }],
    },
  ],
  backstab: [
    {
      id: 'stealth_opener',
      description: 'Consumes Invisibility for +80% damage.',
      flavor: 'shadow',
      condition: { casterHasEffect: 'invisible' },
      consumeCasterEffect: 'invisible',
      damageMultiplier: 1.8,
    },
    {
      id: 'poison_cashout',
      description: 'Consumes Poison for +30% damage per stack.',
      flavor: 'poison',
      condition: { targetHasEffect: 'poison' },
      consumeTargetEffect: 'poison',
      damageMultiplierPerConsumedStack: 0.3,
    },
  ],
  poisonBlade: [{
    id: 'venom_bleed',
    description: 'Bleeding targets take +25% damage and gain an extra Poison stack.',
    flavor: 'poison',
    condition: { targetHasEffect: 'dot' },
    damageMultiplier: 1.25,
    effects: [{ type: 'poison', value: 8, durationMs: 10000 }],
  }],
  arcane_blast: [
    {
      id: 'arcane_shatter',
      description: 'Consumes Freeze for +60% damage and leaves arcane drag behind.',
      flavor: 'arcane',
      condition: { targetHasEffect: 'freeze' },
      consumeTargetEffect: 'freeze',
      damageMultiplier: 1.6,
      effects: [{ type: 'slow', value: 35, durationMs: 4000 }],
    },
    {
      id: 'charged_arcana',
      description: 'Consumes Arcane Charge for +25% damage per stack.',
      flavor: 'arcane',
      condition: { casterHasEffect: 'arcaneCharge' },
      consumeCasterEffect: 'arcaneCharge',
      damageMultiplierPerConsumedStack: 0.25,
    },
  ],
  meteor: [{
    id: 'conflagration',
    description: 'Consumes existing Burn for +30% meteor damage per stack.',
    flavor: 'fire',
    condition: { targetHasEffect: 'burn' },
    consumeTargetEffect: 'burn',
    damageMultiplierPerConsumedStack: 0.3,
  }],
  execute: [{
    id: 'blood_in_water',
    description: 'Targets below 40% health take +35% damage before Execute scaling.',
    flavor: 'blood',
    condition: { targetHealthBelowPct: 0.4 },
    damageMultiplier: 1.35,
  }],
  snipe: [{
    id: 'steady_target',
    description: 'Consumes Slow for +70% damage.',
    flavor: 'impact',
    condition: { targetHasEffect: 'slow' },
    consumeTargetEffect: 'slow',
    damageMultiplier: 1.7,
  }],
  shadow_strike: [{
    id: 'umbral_opener',
    description: 'Consumes Invisibility for +60% damage.',
    flavor: 'shadow',
    condition: { casterHasEffect: 'invisible' },
    consumeCasterEffect: 'invisible',
    damageMultiplier: 1.6,
  }],
  lucky_strike: [{
    id: 'loaded_dice',
    description: 'Targets below 50% health take +35% damage.',
    flavor: 'impact',
    condition: { targetHealthBelowPct: 0.5 },
    damageMultiplier: 1.35,
  }],
  arcane_supremacy: [{
    id: 'arcane_overflow',
    description: 'Consumes Arcane Charge for +35% damage per stack and grants a brief shield.',
    flavor: 'arcane',
    condition: { casterHasEffect: 'arcaneCharge' },
    consumeCasterEffect: 'arcaneCharge',
    damageMultiplierPerConsumedStack: 0.35,
    casterEffects: [{ type: 'shield', value: 180, durationMs: 5000 }],
  }],
  killing_strike: [{
    id: 'execution_window',
    description: 'Targets below 35% health take +75% damage.',
    flavor: 'blood',
    condition: { targetHealthBelowPct: 0.35 },
    damageMultiplier: 1.75,
  }],
  aimed_volley: [{
    id: 'kill_zone',
    description: 'Consumes Marked for +40% damage and pins the kill zone long enough to line up Snipe.',
    flavor: 'impact',
    condition: { targetHasEffect: 'marked' },
    consumeTargetEffect: 'marked',
    damageMultiplier: 1.4,
    effects: [{ type: 'slow', value: 60, durationMs: 6000 }],
  }],
  soul_eater: [{
    id: 'dark_feast',
    description: 'Targets below 50% health take +25% damage and grant a temporary shield.',
    flavor: 'shadow',
    condition: { targetHealthBelowPct: 0.5 },
    damageMultiplier: 1.25,
    casterEffects: [{ type: 'shield', value: 180, durationMs: 6000 }],
  }],
  stalking_arrow: [{
    id: 'venom_tracking',
    description: 'Poisoned targets take +35% damage and are slowed harder.',
    flavor: 'poison',
    condition: { targetHasEffect: 'poison' },
    damageMultiplier: 1.35,
    effects: [{ type: 'slow', value: 55, durationMs: 7000 }],
  }],
};

export function withSkillReactions<T extends Partial<Record<SkillId, SkillDef>>>(skills: T): T {
  const result = { ...skills };
  for (const [skillId, reactions] of Object.entries(SKILL_REACTIONS) as [SkillId, SkillReaction[]][]) {
    const skill = result[skillId];
    if (skill) result[skillId] = { ...skill, reactions };
  }
  return result;
}
