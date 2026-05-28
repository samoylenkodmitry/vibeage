import type { SkillEffect, SkillEffectType, SkillId } from './skills.js';

export interface SkillReactionCondition {
  targetHasEffect?: SkillEffectType;
  casterHasEffect?: SkillEffectType;
}

export interface SkillReaction {
  id: string;
  description: string;
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
    condition: { targetHasEffect: 'burn' },
    consumeTargetEffect: 'burn',
    damageMultiplierPerConsumedStack: 0.35,
  }],
  iceBolt: [{
    id: 'flash_freeze',
    description: 'Consumes Water Weakness to freeze the target for 1.2s and deal +20% damage.',
    condition: { targetHasEffect: 'waterWeakness' },
    consumeTargetEffect: 'waterWeakness',
    damageMultiplier: 1.2,
    effects: [{ type: 'freeze', value: 1, durationMs: 1200 }],
  }],
  bash: [{
    id: 'crack_bleed',
    description: 'Consumes Bleed for +25% damage per stack and extends the stun.',
    condition: { targetHasEffect: 'dot' },
    consumeTargetEffect: 'dot',
    damageMultiplierPerConsumedStack: 0.25,
    effects: [{ type: 'stun', value: 1, durationMs: 2500 }],
  }],
  smite: [{
    id: 'judgment_on_taunt',
    description: 'Deals +50% damage to Taunted enemies.',
    condition: { targetHasEffect: 'taunt' },
    damageMultiplier: 1.5,
  }],
  arrowShot: [{
    id: 'pick_slow_target',
    description: 'Deals +25% damage to Slowed targets.',
    condition: { targetHasEffect: 'slow' },
    damageMultiplier: 1.25,
  }],
  backstab: [
    {
      id: 'stealth_opener',
      description: 'Consumes Invisibility for +80% damage.',
      condition: { casterHasEffect: 'invisible' },
      consumeCasterEffect: 'invisible',
      damageMultiplier: 1.8,
    },
    {
      id: 'poison_cashout',
      description: 'Consumes Poison for +30% damage per stack.',
      condition: { targetHasEffect: 'poison' },
      consumeTargetEffect: 'poison',
      damageMultiplierPerConsumedStack: 0.3,
    },
  ],
};
