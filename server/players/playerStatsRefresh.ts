import type { PlayerState } from '../../packages/sim/entities.js';
import {
  buildContributions,
  computeAllStats,
  type StatComputationResult,
  type StatPlayerView,
} from '../../packages/sim/statContributions.js';
import { DEFAULT_RACE } from '../../packages/content/races.js';

/**
 * PR NN — single engine entrypoint that recomputes player stats from
 * the Contribution registry. Replaces the old
 * `refreshPlayerStatsFromEquipment` + `derivePlayerStats` +
 * `projectPlayerStats` triple. Call sites:
 *   - playerFactory: initial spawn.
 *   - playerSession.hydratePersistedPlayer: post-load.
 *   - playerLifecycle: level-up.
 *   - equipHandlers: equip / unequip.
 *   - impactResolver: status effect added.
 *   - worldMovement.pruneExpiredStatusEffects: effect expired.
 *   - playerIdentity: race / class / spec change.
 */
export function recomputePlayerStats(player: PlayerState): StatComputationResult {
  const view: StatPlayerView = {
    level: player.level,
    race: player.race ?? DEFAULT_RACE,
    className: player.className,
    unlockedSkills: player.unlockedSkills,
    specializationId: player.specializationId ?? null,
    characterInventory: player.characterInventory ?? null,
    statusEffects: player.statusEffects,
    health: player.health,
  };
  const contributions = buildContributions(view);
  const result = computeAllStats(contributions, {
    level: view.level,
    race: view.race ?? DEFAULT_RACE,
    className: view.className,
    health: view.health ?? 0,
    maxHealth: player.maxHealth || 1,
    hpFraction: player.maxHealth > 0 ? (player.health ?? 0) / player.maxHealth : 1,
  });
  applyTotalsToPlayer(player, result);
  return result;
}

function applyTotalsToPlayer(player: PlayerState, result: StatComputationResult): void {
  const t = result.totals;
  player.stats = {
    str: t.str, dex: t.dex, con: t.con, int: t.int, wit: t.wit, men: t.men,
    pAtk: t.pAtk, mAtk: t.mAtk, pDef: t.pDef, mDef: t.mDef,
    hpRegen: t.hpRegen, mpRegen: t.mpRegen,
    accuracy: t.accuracy, evasion: t.evasion,
    attackSpeed: t.attackSpeed, castSpeed: t.castSpeed, runSpeed: t.runSpeed,
    dmgMult: t.dmgMult, critChance: t.critChance, critMult: t.critMult,
  };
  player.maxHealth = t.maxHealth;
  player.maxMana = t.maxMana;
  if (player.health > player.maxHealth) player.health = player.maxHealth;
  if (player.mana > player.maxMana) player.mana = player.maxMana;
}
