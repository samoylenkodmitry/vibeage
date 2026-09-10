import { SKILLS } from '../../../packages/content/skills';
import type { ServerMessage } from '../../../packages/protocol/messages';
import type { CombatLineTone, GameClientState, Vec3 } from './gameTypes';
import { addVisualEvent, type VisualEventMeta } from './visualEventState';
import { effectLabel } from './hud/effectMeta';
import type { DamageNumberVariant } from './damageNumberTexture';
import { emitCombatImpact, severityFromDamage } from './combatFeel';

// Effect types that aren't a persistent buff/debuff worth naming in the log.
const NON_STATUS_EFFECTS = new Set(['damage', 'heal', 'dispel', 'teleport', 'knockback', 'aggroReset']);

/**
 * Floating-number palette. Warm rose for damage we deal, hot red for damage we
 * take, amber for crits, green for heals. Hue AND lightness differ so the four
 * separate even in a colour-blind read — and the sigil baked into the glyph
 * ("-" taken, "+" gained, "!" crit) is the read that never depends on colour.
 */
export const COMBAT_NUMBER_COLORS: Record<DamageNumberVariant, string> = {
  outgoing: '#fda4a4',
  incoming: '#f87171',
  crit: '#fbbf24',
  heal: '#65f28f',
};

/** "Who cast it" prefix: "Your " for the local player, "<Name>'s " for anyone
 *  else we can resolve, "" when the caster is unknown (keeps old lines stable). */
export function casterPrefix(state: GameClientState, casterId?: string): string {
  if (!casterId) return '';
  if (casterId === state.myPlayerId) return 'Your ';
  const name = state.players[casterId]?.name ?? state.enemies[casterId]?.name;
  return name ? `${name}'s ` : '';
}

/** Capitalized labels of the persistent status effects a skill applies ("what changed"). */
export function appliedEffectLabels(skillId: string): string[] {
  const def = Object.prototype.hasOwnProperty.call(SKILLS, skillId) ? SKILLS[skillId as keyof typeof SKILLS] : null;
  const types = [...new Set((def?.effects ?? []).map((e) => e.type).filter((t) => !NON_STATUS_EFFECTS.has(t)))];
  return types.map((t) => { const l = effectLabel(t); return l.charAt(0).toUpperCase() + l.slice(1); });
}

/** Shape of a CombatLog message's outcome arrays — shared by the text
 *  formatter and the tone classifier so the colour matches the words. */
export type CombatLogLineParts = {
  skillId: string;
  /** Who cast it — resolved to a name for the log prefix when known. */
  casterId?: string;
  targets: string[];
  damages: number[];
  crits?: boolean[];
  misses?: boolean[];
  heals?: number[];
};

/**
 * Visual tone for a CombatLog line, derived from the same parts the
 * text formatter uses. Crit beats plain hit; a full miss reads muted;
 * a pure heal / buff gets its own hue.
 */
export function combatLogTone(parts: CombatLogLineParts): CombatLineTone {
  const { skillId, damages, crits, misses, heals } = parts;
  if (misses && misses.length > 0 && misses.every(Boolean)) return 'miss';
  const totalDamage = damages.reduce((sum, d) => sum + d, 0);
  const totalHeal = heals?.reduce((sum, h) => sum + h, 0) ?? 0;
  if (totalDamage <= 0 && totalHeal > 0) return 'heal';
  const skillDef = Object.prototype.hasOwnProperty.call(SKILLS, skillId)
    ? SKILLS[skillId as keyof typeof SKILLS] : null;
  if (totalDamage <= 0 && !(skillDef?.dmg && skillDef.dmg > 0)) return 'buff';
  return crits?.some(Boolean) ? 'crit' : 'offense';
}

/** One resolved hit, from the point of view of the player at this client. */
type ResolvedHit = {
  targetId: string;
  /** Live entity the hit landed on — health/maxHealth drive severity and lethality. */
  entity: { health: number; maxHealth: number; isAlive: boolean; position?: Vec3 };
  amount: number;
  isCrit: boolean;
};

export function addCombatDamageVisualEvents(
  state: GameClientState,
  message: ServerMessage & { type: 'CombatLog' },
  now: number,
): GameClientState {
  return message.targets.reduce((nextState, targetId, index) => {
    const entity = nextState.enemies[targetId] ?? nextState.players[targetId];
    if (!entity) {
      return nextState;
    }
    const position = normalizeEventPosition(entity.position);

    // Miss + damage are mutually exclusive on the server side
    // (the trace either lands or whiffs), but client just trusts
    // whichever flag is set. A miss emits its own VisualEvent kind
    // so the world overlay can render "MISS" instead of a number.
    if (message.misses?.[index]) {
      return addVisualEvent(nextState, {
        kind: 'miss',
        position,
        createdAt: now + index,
      });
    }

    const hit: ResolvedHit = {
      targetId,
      entity,
      amount: message.damages[index] ?? 0,
      isCrit: message.crits?.[index] ?? false,
    };
    let withDamage = nextState;
    if (hit.amount > 0) {
      withDamage = addDamageEvent(nextState, message, hit, position, now + index);
    }
    // Heals ride the same per-target arrays (a vampiric strike damages an enemy
    // and heals on the same cast), so they get their own number over the target
    // instead of only a line in the log.
    const heal = message.heals?.[index] ?? 0;
    if (heal <= 0) return withDamage;
    return addVisualEvent(
      withDamage,
      { kind: 'healing', position, amount: heal, createdAt: now + index },
      { variant: 'heal', severity: severityFromDamage(heal, entity.maxHealth), lethal: false },
    );
  }, state);
}

function addDamageEvent(
  state: GameClientState,
  message: ServerMessage & { type: 'CombatLog' },
  hit: ResolvedHit,
  position: Vec3,
  createdAt: number,
): GameClientState {
  const incoming = hit.targetId === state.myPlayerId;
  const variant: DamageNumberVariant = incoming ? 'incoming' : hit.isCrit ? 'crit' : 'outgoing';
  // "This blow finished it": the damage covers the health the snapshot still
  // shows. Whether the death snapshot has landed yet or not, the comparison
  // holds — a presentation-only read, the server owns the actual kill.
  const lethal = hit.entity.isAlive && hit.amount >= hit.entity.health;
  const severity = severityFromDamage(hit.amount, hit.entity.maxHealth);
  const meta: VisualEventMeta = { variant, severity, lethal };
  emitHitImpact(state, message.casterId, hit, meta);
  return addVisualEvent(
    state,
    { kind: 'damage', position, amount: hit.amount, isCrit: hit.isCrit, color: COMBAT_NUMBER_COLORS[variant], createdAt },
    meta,
  );
}

/**
 * Push the hit onto the game-feel bus — but only when the local player is one
 * end of it. Another party's fight three metres away must never kick our camera.
 */
function emitHitImpact(
  state: GameClientState,
  casterId: string | undefined,
  hit: ResolvedHit,
  meta: VisualEventMeta,
): void {
  const me = state.myPlayerId;
  if (!me) return;
  const incoming = hit.targetId === me;
  if (!incoming && casterId !== me) return;
  const from = incoming ? (casterId ? state.enemies[casterId] ?? state.players[casterId] : null) : state.players[me];
  const direction = hitDirection(from?.position, hit.entity.position);
  const kind = incoming ? 'incoming' : meta.lethal ? 'kill' : hit.isCrit ? 'crit' : 'outgoing';
  emitCombatImpact({ kind, severity: meta.severity, dirX: direction.x, dirZ: direction.z });
}

/** Unit XZ direction the blow travelled, attacker → victim. Zero when unknown. */
function hitDirection(from: Vec3 | undefined, to: Vec3 | undefined): { x: number; z: number } {
  if (!from || !to) return { x: 0, z: 0 };
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  return length < 1e-3 ? { x: 0, z: 0 } : { x: dx / length, z: dz / length };
}

function normalizeEventPosition(position: { x: number; y?: number; z: number } | undefined): Vec3 {
  return {
    x: position?.x ?? 0,
    y: position?.y ?? 0.35,
    z: position?.z ?? 0,
  };
}
