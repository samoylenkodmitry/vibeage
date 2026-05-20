import { describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import { CHARACTER_RACES, RACE_PROFILES } from '../packages/content/races';
import { CLASS_SKILL_TREES } from '../packages/content/classes';
import { SKILLS } from '../packages/content/skills';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createTransientPlayer } from '../server/playerFactory';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { STARTER_SKILL_BY_CLASS } from '../server/players/playerProgression';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { CharacterClass } from '../packages/content/classes';
import type { PlayerState } from '../packages/sim/entities';

// §49/M2 PR009 — starter combat balance tests.
//
// For every base class: spawn a level-1 character of that class, put
// them next to a level-1 goblin, and verify they can kill it within
// `MAX_ROUNDS` cast cycles using only level-1-available skills.
//
// This catches three classes of regression:
//  1. A new class without a real damage path at level 1.
//  2. A mob HP bump that makes the starter goblin un-soloable.
//  3. A scaling change (e.g. STR no longer feeding pAtk) that
//     silently halves a class's DPS.
//
// `MAX_ROUNDS = 40` is intentionally generous — the spirit is
// "can the class kill it at all", not "how fast". Tightening into
// a real time-to-kill SLO is M4 balance-report work.

const MAX_ROUNDS = 40;

/** Best level-1 damage skill the class can cast. Starter if it deals damage, else basicAttack. */
function startingDamageSkillFor(className: CharacterClass): string {
  const starter = STARTER_SKILL_BY_CLASS[className];
  const def = SKILLS[starter];
  if (def?.dmg && def.dmg > 0) return starter;
  return 'basicAttack';
}

/** Pick the first race that allows this class so we always have a valid race+class combo. */
function firstRaceFor(className: CharacterClass): string {
  for (const race of CHARACTER_RACES) {
    if (RACE_PROFILES[race].allowedClasses.includes(className)) return race;
  }
  throw new Error(`no race allows class ${className}`);
}

function makeWorld(caster: PlayerState, target: ReturnType<typeof createEnemy>): CombatWorld {
  return {
    getEnemyById: (id) => (id === target.id ? target : null),
    getPlayerById: (id) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => [target],
    onTargetDied: vi.fn(),
  };
}

function castAt(skillId: string, caster: PlayerState, targetId: string, round: number): Cast {
  return {
    castId: `c-${skillId}-${round}`,
    casterId: caster.id,
    skillId,
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: caster.position.x, z: caster.position.z },
    startedAt: Date.now(),
    castTimeMs: 0,
    targetId,
  } as Cast;
}

function roundsToKillStarterGoblin(className: CharacterClass): { rounds: number; killed: boolean; skillUsed: string } {
  // Spawn the class with the right starter loadout via the real factory.
  const player = createTransientPlayer(`${className}-socket`, className);
  player.className = className;
  player.race = firstRaceFor(className) as PlayerState['race'];
  player.unlockedSkills = Object.keys(CLASS_SKILL_TREES[className].skillProgression)
    .filter((s) => CLASS_SKILL_TREES[className].skillProgression[s as never].level === 1)
    .concat(['basicAttack']) as PlayerState['unlockedSkills'];
  const skillId = startingDamageSkillFor(className);

  const target = createEnemy('goblin', 1, { x: 2, y: 0, z: 0 }, Date.now());
  const world = makeWorld(player, target);
  const out: OutboundEventSink = { publish: vi.fn() };

  for (let i = 0; i < MAX_ROUNDS; i++) {
    resolveCastImpact(castAt(skillId, player, target.id, i), out, world);
    if (target.health <= 0 || !target.isAlive) {
      return { rounds: i + 1, killed: true, skillUsed: skillId };
    }
  }
  return { rounds: MAX_ROUNDS, killed: false, skillUsed: skillId };
}

describe('starter combat balance — every class can kill a L1 goblin', () => {
  const classes = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];

  for (const className of classes) {
    it(`${className} kills the starter goblin in ≤ ${MAX_ROUNDS} rounds`, () => {
      const result = roundsToKillStarterGoblin(className);
      expect(result.killed, `${className} (skill=${result.skillUsed}) failed to kill in ${MAX_ROUNDS} rounds`).toBe(true);
      // Soft balance hint: print the rounds count so a future PR can
      // tune. Not a hard SLO until M4 balance report lands.
      expect(result.rounds).toBeLessThanOrEqual(MAX_ROUNDS);
    });
  }

  it('every class starter skill is castable at level 1', () => {
    for (const className of classes) {
      const skillId = startingDamageSkillFor(className);
      const def = SKILLS[skillId];
      expect(def, `class ${className} resolves to non-existent skill ${skillId}`).toBeDefined();
      expect(def.levelRequired, `class ${className} starter ${skillId} requires level ${def.levelRequired}`).toBeLessThanOrEqual(1);
    }
  });
});
