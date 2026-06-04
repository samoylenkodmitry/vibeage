import { CLASS_SKILL_TREES, type CharacterClass } from '../../packages/content/classes.js';
import {
  PROFICIENCY_LEVEL,
  SPECIALIZATION_UNLOCK_LEVEL,
  SPECIALIZATIONS,
  type SpecializationId,
} from '../../packages/content/specializations.js';
import { SKILLS, type SkillEffectType, type SkillId } from '../../packages/content/skills.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import { starterSkillsFor } from '../players/playerProgression.js';
import {
  createClassCombatPolicy,
  createSimulatedPlayer,
  type ClassCombatPolicyOptions,
  type PlayerAiPolicy,
  type PlayerAiContext,
  type SimEntity,
  type SimulatedPlayerOptions,
  type SimulationAction,
} from './gameSimulator.js';

const CLASS_POLICY_OPTIONS: Record<CharacterClass, ClassCombatPolicyOptions> = {
  mage: { primarySkillId: 'fireball' },
  warrior: { primarySkillId: 'powerStrike' },
  healer: { primarySkillId: 'smite', healAtHealthFraction: 0.65 },
  ranger: { primarySkillId: 'arrowShot' },
  knight: { primarySkillId: 'powerStrike' },
  paladin: { primarySkillId: 'smite', healAtHealthFraction: 0.55 },
  rogue: { primarySkillId: 'backstab' },
};

export type SkillUseTarget = 'enemy' | 'self' | 'ally';

export type SkillUseCondition = {
  targetHasEffect?: SkillEffectType;
  targetMissingEffect?: SkillEffectType;
  casterHasEffect?: SkillEffectType;
  casterMissingEffect?: SkillEffectType;
  targetHealthBelowPct?: number;
  targetHealthAbovePct?: number;
  casterHealthBelowPct?: number;
  casterHealthAbovePct?: number;
};

export type SkillUseRule = {
  skillId: SkillId;
  target: SkillUseTarget;
  when?: SkillUseCondition;
  desiredRangeFraction?: number;
  tactic?: SkillUseTactic;
};

export type SkillUseTactic = 'opener' | 'combo' | 'defensive' | 'control' | 'mobility' | 'sustain' | 'filler';
export type SpecializationAiTactics = Record<SkillUseTactic, SkillId[]>;
export type SpecializationAiIdentity = {
  plan: string;
  desiredRangeFraction: number;
  priorityTactics: readonly SkillUseTactic[];
};

export type SpecializationAiProfile = {
  specializationId: SpecializationId;
  baseClass: CharacterClass;
  role: 'burst' | 'sustain' | 'support' | 'tank' | 'skirmish';
  identity: SpecializationAiIdentity;
  rules: readonly SkillUseRule[];
  tactics: SpecializationAiTactics;
};

const SPECIALIZATION_AI_IDENTITIES: Record<SpecializationId, SpecializationAiIdentity> = {
  arcanist: { plan: 'Lock enemies in place, bank Arcane Charge, then spend it on high-impact arcane casts.', desiredRangeFraction: 0.82, priorityTactics: ['control', 'combo', 'defensive', 'filler'] },
  pyromancer: { plan: 'Maintain Burn, relay it through packs, then detonate the hottest target.', desiredRangeFraction: 0.75, priorityTactics: ['opener', 'combo', 'control', 'filler'] },
  berserker: { plan: 'Pull enemies into melee, open bleeds, and cash wounds into seismic control.', desiredRangeFraction: 0.28, priorityTactics: ['opener', 'combo', 'sustain', 'filler'] },
  slayer: { plan: 'Mark a priority target, blink through it, and execute during health windows.', desiredRangeFraction: 0.22, priorityTactics: ['opener', 'combo', 'defensive', 'filler'] },
  cardinal: { plan: 'Keep allies alive first, then link and punish enemies during stable windows.', desiredRangeFraction: 0.72, priorityTactics: ['defensive', 'sustain', 'control', 'filler'] },
  theurge: { plan: 'Maintain buffs, seal packs, and convert positioning into shields and links.', desiredRangeFraction: 0.68, priorityTactics: ['sustain', 'control', 'mobility', 'filler'] },
  hawkeye: { plan: 'Mark from range, control the lane, then spend the mark on precision shots.', desiredRangeFraction: 0.9, priorityTactics: ['opener', 'combo', 'control', 'filler'] },
  phantom_ranger: { plan: 'Set shadow traps, hide or reposition, then poison marked targets.', desiredRangeFraction: 0.86, priorityTactics: ['opener', 'control', 'mobility', 'combo'] },
  templar_knight: { plan: 'Hook enemies into guard range, keep shields active, and hold aggro.', desiredRangeFraction: 0.32, priorityTactics: ['defensive', 'control', 'sustain', 'filler'] },
  dark_avenger: { plan: 'Force enemies to focus you, reflect damage, then drain value from taunts.', desiredRangeFraction: 0.3, priorityTactics: ['sustain', 'control', 'combo', 'filler'] },
  phoenix_knight: { plan: 'Enter with shields, burn the melee pocket, and recover through holy pressure.', desiredRangeFraction: 0.34, priorityTactics: ['defensive', 'opener', 'sustain', 'filler'] },
  evas_templar: { plan: 'Cleanse first, layer shields, and keep holy pressure while allies stabilize.', desiredRangeFraction: 0.62, priorityTactics: ['defensive', 'sustain', 'control', 'filler'] },
  treasure_hunter: { plan: 'Reveal loot, create false openings, then cash marked targets with lucky strikes.', desiredRangeFraction: 0.38, priorityTactics: ['opener', 'combo', 'control', 'sustain'] },
  plains_walker: { plan: 'Dash through poison windows, split phantoms, and keep speed advantage.', desiredRangeFraction: 0.34, priorityTactics: ['mobility', 'combo', 'defensive', 'filler'] },
};

export const SPECIALIZATION_AI_PROFILES: Record<SpecializationId, SpecializationAiProfile> = {
  arcanist: profile('arcanist', 'burst', [
    enemy('arcane_supremacy', { casterHasEffect: 'arcaneCharge' }),
    enemy('time_sphere', { targetMissingEffect: 'timeStop' }),
    enemy('gravity_well'),
    enemy('dimensional_swap', { casterHealthBelowPct: 0.5 }),
    self('rewind_mark', { casterHealthBelowPct: 0.45 }),
    enemy('arcane_blast', { casterHasEffect: 'arcaneCharge' }),
    enemy('arcane_blast', { targetHasEffect: 'freeze' }),
    enemy('iceBolt', { targetHasEffect: 'waterWeakness' }),
    enemy('phase_prison', { targetMissingEffect: 'silence' }),
    enemy('waterSplash', { targetMissingEffect: 'waterWeakness' }),
    enemy('arcane_supremacy'),
    enemy('stasis_lattice'),
    enemy('arcane_blast'),
    enemy('fireball'),
  ]),
  pyromancer: profile('pyromancer', 'burst', [
    enemy('combustion_bloom', { targetHasEffect: 'burn' }),
    enemy('ember_relay', { targetHasEffect: 'burn' }, undefined, 'combo'),
    enemy('meteor', { targetHasEffect: 'burn' }),
    enemy('cataclysm_rings'),
    enemy('inferno_aura', { targetMissingEffect: 'burn' }),
    enemy('magma_chain', { targetMissingEffect: 'burn' }),
    enemy('fireball', { targetMissingEffect: 'burn' }),
    enemy('ember_relay'),
    enemy('combustion_bloom'),
    enemy('meteor'),
    enemy('magma_chain'),
    enemy('fireball'),
  ]),
  berserker: profile('berserker', 'sustain', [
    self('blood_magnet', { casterMissingEffect: 'attackSpeed' }),
    self('blood_frenzy', { casterMissingEffect: 'bless' }),
    self('rage', { casterMissingEffect: 'bless' }),
    enemy('seismic_rend', { targetHasEffect: 'dot' }, undefined, 'combo'),
    enemy('momentum_strike'),
    enemy('powerStrike', { targetHasEffect: 'stun' }),
    enemy('bash', { targetHasEffect: 'dot' }),
    enemy('slash', { targetMissingEffect: 'dot' }),
    enemy('powerStrike'),
  ]),
  slayer: profile('slayer', 'burst', [
    enemy('killing_strike', { targetHealthBelowPct: 0.35 }),
    enemy('delayed_fate', { targetHealthAbovePct: 0.45 }),
    enemy('duelist_lunge', { targetMissingEffect: 'marked' }),
    enemy('blade_reversal', { casterHealthBelowPct: 0.72 }),
    enemy('execute', { targetHealthBelowPct: 0.4 }),
    enemy('powerStrike', { targetHasEffect: 'stun' }),
    enemy('bash', { targetHasEffect: 'dot' }),
    enemy('slash', { targetMissingEffect: 'dot' }),
    enemy('duelist_lunge'),
    enemy('execute'),
  ]),
  cardinal: profile('cardinal', 'support', [
    self('mass_heal', { casterHealthBelowPct: 0.75 }),
    ally('lifeline_swap', { targetHealthBelowPct: 0.55 }),
    self('sanctuary_gate', { casterHealthBelowPct: 0.65 }),
    self('greater_heal', { casterHealthBelowPct: 0.82 }),
    self('holyLight', { casterHealthBelowPct: 0.9 }),
    self('bless', { casterMissingEffect: 'bless' }),
    enemy('soul_link'),
    enemy('smite'),
  ]),
  theurge: profile('theurge', 'support', [
    self('group_bless', { casterMissingEffect: 'bless' }),
    self('mirror_spell'),
    self('waygate', { casterMissingEffect: 'speed_boost' }),
    self('echoing_benediction'),
    enemy('harmonic_seal', { targetMissingEffect: 'silence' }, undefined, 'control'),
    enemy('portal_pair'),
    self('empower', { casterMissingEffect: 'bless' }),
    self('bless', { casterMissingEffect: 'bless' }),
    self('holyLight', { casterHealthBelowPct: 0.65 }),
    enemy('smite'),
  ]),
  hawkeye: profile('hawkeye', 'burst', [
    enemy('aimed_volley', { targetHasEffect: 'marked' }),
    enemy('tripwire_volley', { targetMissingEffect: 'marked' }),
    enemy('ricochet_prism'),
    enemy('terrain_sigil'),
    enemy('volley', { targetHasEffect: 'marked' }),
    self('projectile_capture', { casterHealthBelowPct: 0.8 }),
    enemy('snipe', { targetHasEffect: 'slow' }),
    self('rapidFire', { casterMissingEffect: 'attackSpeed' }),
    enemy('arrowShot', { targetMissingEffect: 'marked' }),
    enemy('aimed_volley'),
    enemy('snipe'),
    enemy('volley'),
    enemy('arrowShot'),
  ]),
  phantom_ranger: profile('phantom_ranger', 'skirmish', [
    self('silent_step', { casterMissingEffect: 'invisible' }),
    enemy('umbra_mine', { targetMissingEffect: 'marked' }),
    enemy('nightfall_net', { targetHasEffect: 'marked' }, undefined, 'combo'),
    enemy('phase_step'),
    enemy('shadow_arrow'),
    self('rapidFire', { casterMissingEffect: 'attackSpeed' }),
    self('evade', { casterHealthBelowPct: 0.7, casterMissingEffect: 'evasion' }),
    enemy('volley'),
    enemy('arrowShot'),
  ]),
  templar_knight: profile('templar_knight', 'tank', [
    enemy('guardian_hook', { casterMissingEffect: 'shield' }),
    self('bulwark_zone', { casterMissingEffect: 'shield' }),
    self('holy_shield', { casterMissingEffect: 'shield' }),
    enemy('silence_bubble'),
    enemy('divine_taunt'),
    enemy('taunt'),
    self('shieldWall', { casterHealthBelowPct: 0.75, casterMissingEffect: 'shield' }),
    enemy('powerStrike', { targetHasEffect: 'stun' }),
    enemy('bash', { targetHasEffect: 'dot' }),
    enemy('slash'),
  ]),
  dark_avenger: profile('dark_avenger', 'sustain', [
    self('spectral_guard', { casterMissingEffect: 'damageReflect' }),
    self('reflection_contract'),
    enemy('pain_dividend', { targetHasEffect: 'taunt' }, undefined, 'sustain'),
    enemy('vengeance_tether', { targetMissingEffect: 'taunt' }),
    enemy('soul_eater', { targetHealthBelowPct: 0.5 }),
    enemy('shadow_strike'),
    self('shieldWall', { casterHealthBelowPct: 0.7, casterMissingEffect: 'shield' }),
    enemy('powerStrike', { targetHasEffect: 'stun' }),
    enemy('bash', { targetHasEffect: 'dot' }),
    enemy('slash'),
  ]),
  phoenix_knight: profile('phoenix_knight', 'tank', [
    self('rebirth', { casterHealthBelowPct: 0.35, casterMissingEffect: 'shield' }),
    self('phoenix_ward', { casterHealthBelowPct: 0.85, casterMissingEffect: 'shield' }),
    self('cinder_halo', { casterMissingEffect: 'shield' }),
    enemy('sunbreak_charge', { casterMissingEffect: 'shield' }),
    enemy('phoenix_leap', { casterMissingEffect: 'shield' }),
    self('divineShield', { casterHealthBelowPct: 0.65, casterMissingEffect: 'shield' }),
    self('holyLight', { casterHealthBelowPct: 0.7 }),
    enemy('phoenix_leap'),
    enemy('smite'),
  ]),
  evas_templar: profile('evas_templar', 'support', [
    self('tidal_barrier', { casterHasEffect: 'poison' }),
    self('aegis_relay', { casterMissingEffect: 'shield' }),
    self('purifying_mirror', { casterMissingEffect: 'damageReflect' }),
    self('sacred_aura', { casterHealthBelowPct: 0.8 }),
    self('sacred_pulse', { casterHealthBelowPct: 0.85 }),
    self('holyLight', { casterHealthBelowPct: 0.72 }),
    self('divineShield', { casterHealthBelowPct: 0.55, casterMissingEffect: 'shield' }),
    self('aegis_relay'),
    enemy('smite'),
  ]),
  treasure_hunter: profile('treasure_hunter', 'skirmish', [
    self('treasure_sense', { casterMissingEffect: 'reveal_loot' }),
    enemy('lucky_strike', { targetHealthBelowPct: 0.5 }),
    enemy('loaded_mirage', { targetHasEffect: 'marked' }, undefined, 'combo'),
    enemy('jackpot_snare', { targetMissingEffect: 'marked' }),
    enemy('puppet_mastery', { targetHealthAbovePct: 0.5 }),
    enemy('backstab', { casterHasEffect: 'invisible' }),
    self('vanish', { casterMissingEffect: 'invisible' }),
    enemy('poisonBlade', { targetMissingEffect: 'poison' }),
    enemy('backstab'),
    enemy('lucky_strike'),
  ]),
  plains_walker: profile('plains_walker', 'skirmish', [
    self('wind_dash', { casterHealthBelowPct: 0.7, casterMissingEffect: 'speed_boost' }),
    enemy('razorwind_step', { targetHasEffect: 'poison' }),
    enemy('phantom_split', { casterMissingEffect: 'evasion' }),
    enemy('clone_swap'),
    enemy('rift_step', { casterHasEffect: 'invisible' }),
    enemy('stalking_arrow', { targetHasEffect: 'poison' }),
    enemy('backstab', { casterHasEffect: 'invisible' }),
    self('vanish', { casterMissingEffect: 'invisible' }),
    enemy('poisonBlade', { targetMissingEffect: 'poison' }),
    enemy('backstab'),
    enemy('stalking_arrow'),
  ]),
};

export type SimPolicyProfile = {
  className: CharacterClass;
  specializationId?: SpecializationId;
};

export function createClassAiPolicy(
  className: CharacterClass,
  specializationId?: SpecializationId,
): PlayerAiPolicy {
  if (specializationId) return createSpecializationAiPolicy(specializationId);
  const options = { ...CLASS_POLICY_OPTIONS[className] };
  return createClassCombatPolicy(options);
}

export function createSpecializationAiPolicy(specializationId: SpecializationId): PlayerAiPolicy {
  const profile = SPECIALIZATION_AI_PROFILES[specializationId];
  const fallback = createClassCombatPolicy(CLASS_POLICY_OPTIONS[profile.baseClass]);
  return (context) => {
    if (context.player.castingSkill) return [];
    const target = nearestEntity(context.player, context.hostiles);
    for (const rule of profile.rules) {
      const action = actionForRule(context, profile, rule, target);
      if (action.length > 0) return action;
    }
    return fallback(context);
  };
}

export function createSimProfilePlayer(options: SimulatedPlayerOptions & SimPolicyProfile) {
  return createSimulatedPlayer({
    ...options,
    unlockedSkills: options.unlockedSkills ?? unlockedSkillsForSimProfile(options),
    specializationId: options.specializationId ?? null,
  });
}

export function unlockedSkillsForSimProfile(profile: SimPolicyProfile & { level?: number }): SkillId[] {
  const level = profile.level ?? 1;
  const unlocked = new Set<SkillId>(starterSkillsFor(profile.className));
  unlockClassTreeSkills(profile.className, level, unlocked);
  unlockSpecializationSkills(profile, level, unlocked);
  return [...unlocked];
}

export function simPolicyProfiles(): SimPolicyProfile[] {
  const classes = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];
  return [
    ...classes.map((className) => ({ className })),
    ...Object.values(SPECIALIZATIONS).map((spec) => ({
      className: spec.baseClass,
      specializationId: spec.id,
    })),
  ];
}

function unlockClassTreeSkills(className: CharacterClass, level: number, unlocked: Set<SkillId>): void {
  const progression = CLASS_SKILL_TREES[className].skillProgression;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [skillId, requirement] of Object.entries(progression)) {
      if (!requirement || requirement.level > level) continue;
      const id = skillId as SkillId;
      if (unlocked.has(id) || !hasPrerequisites(requirement.requiredSkills, unlocked)) continue;
      unlocked.add(id);
      changed = true;
    }
  }
}

function unlockSpecializationSkills(
  profile: SimPolicyProfile,
  level: number,
  unlocked: Set<SkillId>,
): void {
  if (!profile.specializationId) return;
  const spec = SPECIALIZATIONS[profile.specializationId];
  if (!spec || spec.baseClass !== profile.className) return;
  if (level >= SPECIALIZATION_UNLOCK_LEVEL) {
    for (const skillId of spec.specSkills ?? []) unlocked.add(skillId);
  }
  if (level >= PROFICIENCY_LEVEL) {
    for (const skillId of spec.proficiencySkills ?? []) unlocked.add(skillId);
  }
}

function hasPrerequisites(requiredSkills: readonly SkillId[] | undefined, unlocked: Set<SkillId>): boolean {
  return requiredSkills?.every((skillId) => unlocked.has(skillId)) ?? true;
}

function profile(
  specializationId: SpecializationId,
  role: SpecializationAiProfile['role'],
  rules: readonly SkillUseRule[],
): SpecializationAiProfile {
  return {
    specializationId,
    baseClass: SPECIALIZATIONS[specializationId].baseClass,
    role,
    identity: SPECIALIZATION_AI_IDENTITIES[specializationId],
    rules,
    tactics: buildTactics(rules),
  };
}

function buildTactics(rules: readonly SkillUseRule[]): SpecializationAiTactics {
  const tactics: SpecializationAiTactics = {
    opener: [],
    combo: [],
    defensive: [],
    control: [],
    mobility: [],
    sustain: [],
    filler: [],
  };
  rules.forEach((rule, index) => tactics[rule.tactic ?? inferTactic(rule, index)].push(rule.skillId));
  for (const key of Object.keys(tactics) as SkillUseTactic[]) {
    tactics[key] = [...new Set(tactics[key])];
  }
  return tactics;
}

function inferTactic(rule: SkillUseRule, index: number): SkillUseTactic {
  const skill = SKILLS[rule.skillId];
  if (rule.when?.casterHealthBelowPct || rule.when?.casterMissingEffect === 'shield') return 'defensive';
  if (rule.when?.targetHasEffect || rule.when?.casterHasEffect || rule.when?.targetHealthBelowPct) return 'combo';
  if (skill?.role === 'mobility' || skill?.targetMode === 'ground') return 'mobility';
  if (skill?.role === 'heal' || skill?.role === 'tank' || skill?.role === 'utility') return 'sustain';
  if (skill?.role === 'control' || skill?.effects.some((effect) => ['stun', 'slow', 'freeze', 'timeStop', 'taunt', 'silence', 'knockback', 'marked'].includes(effect.type))) return 'control';
  return index < 3 ? 'opener' : 'filler';
}

function enemy(skillId: SkillId, when?: SkillUseCondition, desiredRangeFraction?: number, tactic?: SkillUseTactic): SkillUseRule {
  return { skillId, target: 'enemy', when, desiredRangeFraction, tactic };
}

function self(skillId: SkillId, when?: SkillUseCondition, tactic?: SkillUseTactic): SkillUseRule {
  return { skillId, target: 'self', when, tactic };
}

function ally(skillId: SkillId, when?: SkillUseCondition, desiredRangeFraction?: number, tactic?: SkillUseTactic): SkillUseRule {
  return { skillId, target: 'ally', when, desiredRangeFraction, tactic };
}

function actionForRule(
  context: PlayerAiContext,
  profile: SpecializationAiProfile,
  rule: SkillUseRule,
  target: SimEntity | null,
): SimulationAction[] {
  if (!canAttemptSkill(context, rule.skillId)) return [];
  if (rule.target === 'self') {
    if (!conditionMatches(rule.when, context, context.player)) return [];
    if (context.player.movement?.isMoving) return [{ type: 'stopMoving' }, { type: 'castSkill', skillId: rule.skillId }];
    return [{ type: 'castSkill', skillId: rule.skillId }];
  }
  if (rule.target === 'ally') {
    const allyTarget = mostInjuredAlly(context);
    if (!allyTarget || !conditionMatches(rule.when, context, allyTarget)) return [];
    return engageTarget(context, profile, allyTarget, rule.skillId, rule.desiredRangeFraction);
  }
  if (!conditionMatches(rule.when, context, target)) return [];
  if (!target) return [];
  return engageTarget(context, profile, target, rule.skillId, rule.desiredRangeFraction);
}

function conditionMatches(
  condition: SkillUseCondition | undefined,
  context: PlayerAiContext,
  target: SimEntity | null,
): boolean {
  if (!condition) return true;
  if (condition.targetHasEffect && (!target || !hasActiveEffect(target, condition.targetHasEffect, context.now))) return false;
  if (condition.targetMissingEffect && target && hasActiveEffect(target, condition.targetMissingEffect, context.now)) return false;
  if (condition.casterHasEffect && !hasActiveEffect(context.player, condition.casterHasEffect, context.now)) return false;
  if (condition.casterMissingEffect && hasActiveEffect(context.player, condition.casterMissingEffect, context.now)) return false;
  if (condition.targetHealthBelowPct !== undefined && (!target || healthFraction(target) >= condition.targetHealthBelowPct)) return false;
  if (condition.targetHealthAbovePct !== undefined && (!target || healthFraction(target) <= condition.targetHealthAbovePct)) return false;
  if (condition.casterHealthBelowPct !== undefined && healthFraction(context.player) >= condition.casterHealthBelowPct) return false;
  if (condition.casterHealthAbovePct !== undefined && healthFraction(context.player) <= condition.casterHealthAbovePct) return false;
  return true;
}

function engageTarget(
  context: PlayerAiContext,
  profile: SpecializationAiProfile,
  target: SimEntity,
  skillId: SkillId,
  desiredRangeFraction?: number,
): SimulationAction[] {
  const range = skillRange(skillId);
  if (context.distanceTo(target) > range) {
    const desired = desiredRangeFraction ?? profile.identity.desiredRangeFraction;
    return [{ type: 'moveTo', targetPos: approachPoint(context.player.position, target.position, range, desired) }];
  }
  const actions: SimulationAction[] = [];
  if (context.player.movement?.isMoving) actions.push({ type: 'stopMoving' });
  actions.push({ type: 'setTarget', targetId: target.id });
  actions.push({ type: 'castSkill', skillId, targetId: target.id, force: !isEnemy(target) });
  return actions;
}

function canAttemptSkill(context: PlayerAiContext, skillId: SkillId): boolean {
  const skill = SKILLS[skillId];
  if (!skill || !context.player.unlockedSkills.includes(skillId)) return false;
  if ((context.player.skillCooldownEndTs[skillId] ?? 0) > context.now) return false;
  return context.player.mana >= skill.manaCost;
}

function skillRange(skillId: SkillId): number {
  const skill = SKILLS[skillId];
  return Math.max(1, skill?.range ?? skill?.projectile?.maxRange ?? 1);
}

function hasActiveEffect(entity: SimEntity, type: SkillEffectType, now: number): boolean {
  return (entity.statusEffects ?? []).some((effect) => (
    effect.type === type && (effect.durationMs <= 0 || effect.startTimeTs + effect.durationMs > now)
  ));
}

function healthFraction(entity: SimEntity): number {
  if (entity.maxHealth <= 0) return 0;
  return Math.max(0, entity.health / entity.maxHealth);
}

function nearestEntity(origin: SimEntity, candidates: readonly SimEntity[]): SimEntity | null {
  let nearest: SimEntity | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = distanceXZ(origin.position, candidate.position);
    if (distance < bestDistance) {
      nearest = candidate;
      bestDistance = distance;
    }
  }
  return nearest;
}

function mostInjuredAlly(context: PlayerAiContext): SimEntity | null {
  let best: SimEntity | null = null;
  let bestHealthFraction = Infinity;
  for (const ally of context.allies) {
    if (ally.id === context.player.id || ally.health <= 0) continue;
    const fraction = healthFraction(ally);
    if (fraction < bestHealthFraction) {
      best = ally;
      bestHealthFraction = fraction;
    }
  }
  return best;
}

function approachPoint(
  from: { x: number; z: number },
  target: { x: number; z: number },
  range: number,
  desiredRangeFraction: number,
) {
  const distance = distanceXZ(from, target);
  if (distance <= 0.001) return { x: target.x, z: target.z };
  const desired = Math.max(0.5, range * desiredRangeFraction);
  const keep = Math.min(distance, desired);
  return {
    x: target.x + ((from.x - target.x) / distance) * keep,
    z: target.z + ((from.z - target.z) / distance) * keep,
  };
}

function isEnemy(target: SimEntity): boolean {
  return 'type' in target;
}
