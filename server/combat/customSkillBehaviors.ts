import type { Cast } from './skillSystem.js';
import type { CombatWorld } from './worldContract.js';

export type CustomSkillBehavior = (cast: Cast, world: CombatWorld, now: number) => void;

/** Fallback rally radius when the caster carries no per-mob pack radius. */
const WARBAND_HOWL_RADIUS = 60;

/**
 * Registered custom ability behaviors — the sanctioned escape hatch
 * (docs/ABILITY_SYSTEM.md §2b) for the rare ability the declarative
 * schema can't express. Each is referenced by id from a first-class
 * SkillDef (name + description shown in the wiki), and resolveCastImpact
 * runs the matching fn instead of the declarative resolution. Prefer
 * data; this map is the documented exception, not a parallel system.
 */
export const CUSTOM_SKILL_BEHAVIORS: Record<string, CustomSkillBehavior> = {
  /**
   * Warband Howl — rally every alive packmate in range onto the caster's
   * current target, regardless of their AI state. Bespoke because it
   * re-targets *existing* mobs (not a shape, not a spawn).
   */
  warbandHowl: (cast, world) => {
    const caster = world.getEnemyById(cast.casterId);
    const targetId = cast.targetId;
    if (!caster?.packId || !targetId) return;
    const radius = caster.packAggroRadius ?? WARBAND_HOWL_RADIUS;
    for (const entity of world.getEntitiesInCircle(caster.position, radius)) {
      if ('type' in entity && entity.id !== caster.id && entity.packId === caster.packId && entity.isAlive) {
        entity.targetId = targetId;
        entity.aiState = 'chasing';
      }
    }
  },
};
