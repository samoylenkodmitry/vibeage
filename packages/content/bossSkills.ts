import type { SkillDef, SkillId } from './skills.js';
import { MINI_BOSSES, type MiniBossMechanic } from './miniBosses.js';

/**
 * Boss signature abilities, expressed as ordinary skills (docs/ABILITY_SYSTEM.md
 * §A3). Each mini-boss's `MiniBossMechanic` is mapped onto the shared ability
 * vocabulary — a telegraphed shaped blast, a blink, or the `warbandHowl` custom
 * rally — so bosses cast through the exact same pipeline as players and mobs.
 * There is no boss-specific resolution code; deleting bossSignature.ts removed it.
 */

/** Stable skill id for a boss's signature. */
export const bossSignatureSkillId = (bossId: string): SkillId => `boss_${bossId}_sig` as SkillId;

/**
 * Literal tuple of every boss signature id, spread into SKILL_IDS so SkillId
 * stays an exhaustive union. A test pins this against MINI_BOSSES, so adding a
 * boss without its id here fails CI rather than silently losing type-safety.
 */
export const BOSS_SIGNATURE_SKILL_IDS = [
  'boss_grakk_sig', 'boss_old_greyfang_sig', 'boss_hammerback_sig', 'boss_mistwalker_sig',
  'boss_vereth_bone_lord_sig', 'boss_vorthax_ember_wyrm_sig', 'boss_nyaraal_sig', 'boss_prism_warden_sig',
  'boss_magmaheart_sig', 'boss_skadrun_sig', 'boss_elder_vinebrook_sig', 'boss_cthulun_sig',
  'boss_auriel_sig', 'boss_aethariel_sig',
] as const;

type AbilityPart = Pick<
  SkillDef,
  'shape' | 'affects' | 'telegraph' | 'blink' | 'customBehavior' | 'damageMult' | 'kind' | 'effects'
>;

/** Map a boss mechanic onto the shared ability axes. */
function mechanicAbility(mech: MiniBossMechanic): AbilityPart {
  const telegraph = { windUpMs: mech.windUpMs };
  const dmg: SkillDef['effects'] = [{ type: 'damage', value: 1 }];
  switch (mech.kind) {
    case 'circle':
      return { shape: { kind: 'circle', radius: mech.radiusUnits, anchor: 'target' }, affects: 'enemies', telegraph, damageMult: mech.damageMul, kind: 'physical', effects: dmg };
    case 'donut':
      return { shape: { kind: 'donut', innerRadius: mech.innerRadius, outerRadius: mech.outerRadius, anchor: 'target' }, affects: 'enemies', telegraph, damageMult: mech.damageMul, kind: 'physical', effects: dmg };
    case 'cone':
      return { shape: { kind: 'cone', length: mech.lengthUnits, halfAngleDeg: mech.halfAngleDeg, anchor: 'caster' }, affects: 'enemies', telegraph, damageMult: mech.damageMul, kind: 'physical', effects: dmg };
    case 'blink':
      return { blink: { offset: mech.teleportOffset }, affects: 'enemies', telegraph, damageMult: mech.damageMul, kind: 'physical', effects: dmg };
    case 'summonPack':
      return { customBehavior: 'warbandHowl', telegraph, kind: 'utility', effects: [] };
  }
}

/** Caster→target distance at which the boss may begin the signature cast. */
function signatureRange(mech: MiniBossMechanic): number {
  switch (mech.kind) {
    case 'circle': return mech.radiusUnits;
    case 'donut': return mech.outerRadius;
    case 'cone': return mech.lengthUnits;
    case 'blink': return 30;
    case 'summonPack': return mech.summonRadius;
  }
}

export const BOSS_SIGNATURE_SKILLS: Record<string, SkillDef> = Object.fromEntries(
  Object.values(MINI_BOSSES).map((spec) => {
    const mech = spec.signatureAbility.mechanic;
    const id = bossSignatureSkillId(spec.id);
    const skill: SkillDef = {
      id, name: spec.signatureAbility.name, description: spec.signatureAbility.description,
      icon: '/game/skills/skill_fireball.png', cat: 'instant',
      manaCost: 0, castMs: 0, cooldownMs: mech.cooldownMs,
      weaponScaled: mech.kind !== 'summonPack',
      range: Math.max(signatureRange(mech), 6), levelRequired: 1, requiresTarget: true, isBlocking: false,
      ...mechanicAbility(mech),
    };
    return [id, skill];
  }),
);
