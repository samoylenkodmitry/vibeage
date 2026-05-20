/**
 * §49/M1 PR005 + M4 — balance report CLI.
 *
 * Generates a snapshot of every class's derived stats at the
 * canonical level checkpoints (L1, L5, L10, L20, L40) plus a
 * starter time-to-kill estimate (how many cast cycles each class
 * needs to drop a L1 goblin).
 *
 * Reads from the real `createTransientPlayer` + `recomputePlayerStats`
 * + `resolveCastImpact` pipeline so the numbers always reflect
 * shipped engine behaviour. No DB / no network — runs as a content
 * tool. Output is Markdown so a designer can drop it into a PR
 * comment or save for diffing.
 *
 * Run: `pnpm run balance:report`.
 */
import { CHARACTER_RACES, RACE_PROFILES } from '../packages/content/races.js';
import { CLASS_SKILL_TREES, type CharacterClass } from '../packages/content/classes.js';
import { SKILLS } from '../packages/content/skills.js';
import { CastState } from '../packages/protocol/messages.js';
import { createEnemy } from '../server/enemies/enemyLifecycle.js';
import { createTransientPlayer } from '../server/playerFactory.js';
import { resolveCastImpact } from '../server/combat/impactResolver.js';
import { recomputePlayerStats } from '../server/players/playerStatsRefresh.js';
import { STARTER_SKILL_BY_CLASS, starterSkillsFor } from '../server/players/playerProgression.js';
import type { Cast } from '../server/combat/skillSystem.js';
import type { CombatWorld } from '../server/combat/worldContract.js';
import type { OutboundEventSink } from '../server/transport/outboundEvents.js';
import type { PlayerState } from '../packages/sim/entities.js';

const LEVEL_CHECKPOINTS = [1, 5, 10, 20, 40] as const;
const TTK_TARGET = 'goblin';
const TTK_MAX_ROUNDS = 60;
const TTK_TIMESTAMP = 1_716_200_000_000;

function firstRaceFor(className: CharacterClass): string {
  for (const race of CHARACTER_RACES) {
    if (RACE_PROFILES[race].allowedClasses.includes(className)) return race;
  }
  throw new Error(`no race allows class ${className}`);
}

function buildPlayer(className: CharacterClass, level: number): PlayerState {
  const player = createTransientPlayer(`${className}-bal`, className);
  player.className = className;
  player.race = firstRaceFor(className) as PlayerState['race'];
  player.unlockedSkills = starterSkillsFor(className);
  player.level = level;
  recomputePlayerStats(player);
  player.health = player.maxHealth;
  player.mana = player.maxMana;
  return player;
}

function startingDamageSkill(className: CharacterClass): string {
  const starter = STARTER_SKILL_BY_CLASS[className];
  const def = SKILLS[starter];
  return def?.dmg && def.dmg > 0 ? starter : 'basicAttack';
}

function castAt(skillId: string, caster: PlayerState, targetId: string, round: number): Cast {
  return {
    castId: `c-${skillId}-${round}`,
    casterId: caster.id,
    skillId,
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: caster.position.x, z: caster.position.z },
    startedAt: TTK_TIMESTAMP,
    castTimeMs: 0,
    targetId,
  } as Cast;
}

function simulateTtk(className: CharacterClass): { rounds: number; killed: boolean; skill: string } {
  const player = buildPlayer(className, 1);
  const skillId = startingDamageSkill(className);
  const target = createEnemy(TTK_TARGET, 1, { x: 2, y: 0, z: 0 }, TTK_TIMESTAMP);
  const world: CombatWorld = {
    getEnemyById: (id) => (id === target.id ? target : null),
    getPlayerById: (id) => (id === player.id ? player : null),
    getEntitiesInCircle: () => [target],
    onTargetDied: () => undefined,
  };
  const out: OutboundEventSink = { publish: () => undefined };
  for (let i = 0; i < TTK_MAX_ROUNDS; i++) {
    resolveCastImpact(castAt(skillId, player, target.id, i), out, world);
    if (target.health <= 0 || !target.isAlive) {
      return { rounds: i + 1, killed: true, skill: skillId };
    }
  }
  return { rounds: TTK_MAX_ROUNDS, killed: false, skill: skillId };
}

const classes = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];

console.log('# VibeAge balance report');
console.log('');
console.log(`Generated ${new Date().toISOString().slice(0, 10)} from \`createTransientPlayer\` + \`recomputePlayerStats\`. TTK target: L1 \`${TTK_TARGET}\`, max ${TTK_MAX_ROUNDS} rounds.`);
console.log('');

console.log('## Stat checkpoints by class');
console.log('');
console.log('| Class | Lv | HP | MP | dmgMult | pAtk | mAtk | pDef | mDef |');
console.log('|-------|----|----|----|---------|------|------|------|------|');
for (const className of classes) {
  for (const level of LEVEL_CHECKPOINTS) {
    const p = buildPlayer(className, level);
    const s = p.stats ?? {};
    console.log(
      `| ${className} | ${level} | ${Math.round(p.maxHealth)} | ${Math.round(p.maxMana)} | ${(s.dmgMult ?? 1).toFixed(2)} | ${Math.round(s.pAtk ?? 0)} | ${Math.round(s.mAtk ?? 0)} | ${Math.round(s.pDef ?? 0)} | ${Math.round(s.mDef ?? 0)} |`,
    );
  }
}

console.log('');
console.log('## Starter time-to-kill (L1 vs L1 goblin)');
console.log('');
console.log('| Class | Skill used | Rounds | Killed |');
console.log('|-------|------------|--------|--------|');
for (const className of classes) {
  const r = simulateTtk(className);
  console.log(`| ${className} | ${r.skill} | ${r.rounds} | ${r.killed ? '✓' : '✗'} |`);
}
