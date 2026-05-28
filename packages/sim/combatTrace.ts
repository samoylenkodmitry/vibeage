/**
 * §49/M4 PR016 — combat trace object.
 *
 * Every damage roll going through `calculateDamage` can produce a
 * structured trace recording how the final number was assembled.
 * Designers + dev tools read this to answer "why did Fireball just
 * do 187 instead of 150?". Never broadcast to clients — it would
 * leak caster spec info to the target.
 *
 * Trace fields mirror the multiplier chain in `calculateDamage`:
 * base × variance × dmgMult × upgradeDmgMult × elementVuln ×
 * casterElement × partyAura × reactionDmg. The `final` field is what
 * `calculateDamage` returns; `expectedFinal` is the trace's own
 * recomputation as a sanity check (tests pin them equal).
 */
import type { SkillId } from '../content/skills.js';

export interface CombatTrace {
  skillId: SkillId;
  casterId: string | null;
  targetId: string | null;
  /** Base damage from `SkillDef.dmg`. */
  baseDamage: number;
  /** Random variance roll in [1-variance, 1+variance]. */
  varianceRoll: number;
  /** Caster's resolved `stats.dmgMult` (race + class + equipment + buffs). */
  casterDmgMult: number;
  /** Per-tier upgrade multiplier from the player's skill level. */
  upgradeDmgMult: number;
  /** Target element-vulnerability multiplier (waterWeakness, etc.). */
  elementVulnMult: number;
  /** Caster spec's element multiplier (Pyromancer +20% fire, etc.). */
  casterElementMult: number;
  /** Party damage aura multiplier (Theurge Patron Saint, etc.). */
  partyAuraMult: number;
  /** Conditional skill-reaction multiplier (burn detonation, stealth opener, etc.). */
  reactionDmgMult: number;
  /** True when this hit rolled a critical strike. */
  isCrit: boolean;
  /** Caster's crit multiplier (typically 2.0); applied only when `isCrit`. */
  critMult: number;
  /** Final damage value `calculateDamage` returns. */
  final: number;
}

/**
 * Recompute the trace's expected final from its fields. Tests use
 * this to pin that the engine's `final` matches the breakdown —
 * drift means a multiplier landed somewhere the trace didn't see.
 */
export function expectedTraceFinal(trace: Omit<CombatTrace, 'final'>): number {
  return (
    trace.baseDamage
    * trace.varianceRoll
    * trace.casterDmgMult
    * trace.upgradeDmgMult
    * (trace.isCrit ? trace.critMult : 1)
    * trace.elementVulnMult
    * trace.casterElementMult
    * trace.partyAuraMult
    * trace.reactionDmgMult
  );
}

/**
 * Dev-only recorder. Production code never calls `enable()`, so the
 * push path stays zero-cost (calculateDamage checks `enabled` and
 * skips the trace object entirely when false).
 */
let enabled = false;
const buffer: CombatTrace[] = [];

export function enableCombatTraceCapture(): void {
  enabled = true;
}

export function disableCombatTraceCapture(): void {
  enabled = false;
  buffer.length = 0;
}

export function isCombatTraceEnabled(): boolean {
  return enabled;
}

export function recordCombatTrace(trace: CombatTrace): void {
  if (!enabled) return;
  buffer.push(trace);
}

/** Drain and return every trace captured since the last drain. */
export function drainCombatTraces(): CombatTrace[] {
  const out = buffer.slice();
  buffer.length = 0;
  return out;
}
