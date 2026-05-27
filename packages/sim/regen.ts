/**
 * Generic resource-regeneration core.
 *
 * The engine applies this to ANY entity that carries health (and,
 * optionally, mana). The per-entity RATE is a characteristic of that
 * entity — `stats.hpRegen` / `stats.mpRegen` — so a player and a mob
 * run the identical math and differ only in their spec-derived numbers.
 * No class, mob type, or individual mechanic is special-cased here: a
 * mob that should regenerate carries a non-zero `hpRegen` in its
 * template; one that shouldn't carries 0 (the default) and never moves.
 *
 * The function is pure-ish (mutates the passed target, returns the
 * applied deltas) and clock-free — the caller passes the elapsed
 * seconds it computed from the injected tick `now`.
 */
export interface RegenTarget {
  health: number;
  maxHealth: number;
  /** Absent for entities with no mana pool (e.g. most mobs). */
  mana?: number;
  maxMana?: number;
}

export interface RegenDeltas {
  hp: number;
  mp: number;
}

/**
 * Advance `target`'s health/mana toward their caps at the given
 * per-second rates over `dtSeconds`, clamping at the caps. Returns the
 * amount actually applied so the caller can decide whether the change
 * is worth emitting. A non-positive rate or elapsed time is a no-op.
 */
export function applyResourceRegen(
  target: RegenTarget,
  hpPerSec: number,
  mpPerSec: number,
  dtSeconds: number,
): RegenDeltas {
  const deltas: RegenDeltas = { hp: 0, mp: 0 };
  if (dtSeconds <= 0) return deltas;

  if (hpPerSec > 0 && target.health < target.maxHealth) {
    const next = Math.min(target.maxHealth, target.health + hpPerSec * dtSeconds);
    deltas.hp = next - target.health;
    target.health = next;
  }

  if (
    mpPerSec > 0
    && target.mana !== undefined
    && target.maxMana !== undefined
    && target.mana < target.maxMana
  ) {
    const next = Math.min(target.maxMana, target.mana + mpPerSec * dtSeconds);
    deltas.mp = next - target.mana;
    target.mana = next;
  }

  return deltas;
}
