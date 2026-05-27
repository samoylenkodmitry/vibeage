import { describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import { CHARACTER_RACES, RACE_PROFILES } from '../packages/content/races';
import { CLASS_SKILL_TREES, type CharacterClass } from '../packages/content/classes';
import { SKILLS, type SkillId } from '../packages/content/skills';
import { QUESTS } from '../packages/content/quests';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createTransientPlayer } from '../server/playerFactory';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { recomputePlayerStats } from '../server/players/playerStatsRefresh';
import { STARTER_SKILL_BY_CLASS, starterSkillsFor } from '../server/players/playerProgression';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

// §49/M2 — first-quest mana sustainability.
//
// Sibling of `starterBalance.spec.ts`. That spec proves every class
// can damage a goblin within `MAX_ROUNDS` casts. This spec proves
// every class can complete the *first quest* — kill 3 goblins
// back-to-back — without bottoming out on mana, by either:
//
//   (a) using a 0-mana starter (basicAttack-shaped), or
//   (b) using a paid starter that fits the L1 mana pool, with
//       basicAttack as the implicit fallback when the pool drains.
//
// Mana does NOT regenerate between fights in this sim — the player
// is assumed to push through all 3 goblins. If the class needs to
// wait between kills today, the test catches it.

const MAX_CASTS_PER_GOBLIN = 40;
const GOBLINS = (() => {
  // Drive the kill count off the actual first quest, so a content
  // change (e.g. "kill 5 rats" instead of 3 goblins) re-tunes the
  // test automatically.
  const rats = QUESTS['rats_in_the_cellar'];
  const killStage = rats?.stages.find((s) => s.objective.kind === 'kill');
  return killStage?.objective.kind === 'kill' ? killStage.objective.count : 3;
})();
const TEST_TIMESTAMP = 1_716_200_000_000;

function firstRaceFor(className: CharacterClass): string {
  for (const race of CHARACTER_RACES) {
    if (RACE_PROFILES[race].allowedClasses.includes(className)) return race;
  }
  throw new Error(`no race allows class ${className}`);
}

function startingDamageSkillFor(className: CharacterClass): SkillId {
  const starter = STARTER_SKILL_BY_CLASS[className];
  const def = SKILLS[starter];
  if (def?.dmg && def.dmg > 0) return starter;
  return 'basicAttack';
}

function makeWorld(caster: PlayerState, target: ReturnType<typeof createEnemy>): CombatWorld {
  return {
    getEnemyById: (id) => (id === target.id ? target : null),
    getPlayerById: (id) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => [target],
    onTargetDied: vi.fn(),
  };
}

function castAt(skillId: SkillId, caster: PlayerState, targetId: string, round: number): Cast {
  return {
    castId: `c-${skillId}-${round}`,
    casterId: caster.id,
    skillId,
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: caster.position.x, z: caster.position.z },
    startedAt: TEST_TIMESTAMP,
    castTimeMs: 0,
    targetId,
  } as Cast;
}

type QuestSimResult = {
  killed: number;
  castsTotal: number;
  starterUses: number;
  basicUses: number;
};

function simulateFirstQuest(className: CharacterClass): QuestSimResult {
  const player = createTransientPlayer(`${className}-mana`, className);
  player.className = className;
  player.race = firstRaceFor(className) as PlayerState['race'];
  player.unlockedSkills = starterSkillsFor(className);
  recomputePlayerStats(player);
  player.health = player.maxHealth;
  player.mana = player.maxMana;

  const starter = startingDamageSkillFor(className);
  const starterCost = SKILLS[starter]?.manaCost ?? 0;
  const result: QuestSimResult = { killed: 0, castsTotal: 0, starterUses: 0, basicUses: 0 };

  for (let i = 0; i < GOBLINS; i++) {
    const target = createEnemy('goblin', 1, { x: 2, y: 0, z: 0 }, TEST_TIMESTAMP + i);
    const world = makeWorld(player, target);
    const out: OutboundEventSink = { publish: vi.fn() };

    let casts = 0;
    while (casts < MAX_CASTS_PER_GOBLIN && target.health > 0 && target.isAlive) {
      const useStarter = player.mana >= starterCost;
      const skillId: SkillId = useStarter ? starter : 'basicAttack';
      const cost = useStarter ? starterCost : 0;
      player.mana = Math.max(0, player.mana - cost);
      resolveCastImpact(castAt(skillId, player, target.id, casts), out, world, Date.now());
      casts++;
      result.castsTotal++;
      if (useStarter) result.starterUses++; else result.basicUses++;
    }

    if (target.health <= 0 || !target.isAlive) {
      result.killed++;
    } else {
      break;
    }
  }

  return result;
}

describe('starter mana economy — every class can complete the first quest', () => {
  const classes = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];

  for (const className of classes) {
    it(`${className} kills ${GOBLINS} goblins back-to-back without OOM-stalling`, () => {
      const result = simulateFirstQuest(className);
      expect(
        result.killed,
        `${className} killed ${result.killed}/${GOBLINS} ` +
          `(starter casts: ${result.starterUses}, basic-attack casts: ${result.basicUses})`,
      ).toBe(GOBLINS);
    });
  }

  it('every starter damage skill fits within its class L1 mana pool', () => {
    for (const className of classes) {
      const player = createTransientPlayer(`${className}-mp`, className);
      player.className = className;
      player.race = firstRaceFor(className) as PlayerState['race'];
      player.unlockedSkills = starterSkillsFor(className);
      recomputePlayerStats(player);
      const starter = startingDamageSkillFor(className);
      const cost = SKILLS[starter]?.manaCost ?? 0;
      // Either the starter is mana-free (basicAttack-shaped) OR the
      // L1 pool admits at least one cast — without one of these the
      // class enters the world unable to use its themed skill at all.
      expect(
        cost === 0 || player.maxMana >= cost,
        `${className} starter ${starter} costs ${cost} mp but L1 maxMana is ${player.maxMana}`,
      ).toBe(true);
    }
  });
});
