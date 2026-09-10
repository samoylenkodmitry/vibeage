/**
 * How dangerous a mob is *to you*, expressed the way every MMO player already
 * reads it: by the colour of its nameplate.
 *
 * Today the world paints every living enemy the same red, so a level-2 rabbit
 * and a level-14 troll standing side by side look equally threatening — the
 * only way to tell them apart is to click one and read the target panel. That
 * turns "which of these can I fight?" into a clicking chore in a game whose
 * whole loop is walking into a zone and picking a target.
 *
 * The bands follow the con-colour convention (red → orange → yellow → green →
 * grey) rather than inventing a scheme, because a player arriving from any
 * other MMO already knows how to read it without being taught.
 *
 * The HUD's target panel keeps its own coarser three-band `enemyLevelTone`
 * (hud/PlatePanels.tsx) — it answers a narrower question about the one enemy
 * you've selected. Folding the two together is a worthwhile follow-up; they're
 * kept apart here only because that file is being edited concurrently.
 */
export type EnemyThreat = 'trivial' | 'low' | 'fair' | 'high' | 'deadly';

/**
 * Level deltas (enemy − player) at which each band starts, ordered from most
 * dangerous down. `fair` deliberately spans ±2 so the usual "grind mobs around
 * my level" band reads as one colour instead of flickering between two as you
 * level.
 */
const THREAT_BANDS: ReadonlyArray<{ minDelta: number; threat: EnemyThreat }> = [
  { minDelta: 6, threat: 'deadly' },
  { minDelta: 3, threat: 'high' },
  { minDelta: -2, threat: 'fair' },
  { minDelta: -5, threat: 'low' },
  { minDelta: Number.NEGATIVE_INFINITY, threat: 'trivial' },
];

export function enemyThreat(playerLevel: number, enemyLevel: number): EnemyThreat {
  // An unknown level (0/undefined from a partial snapshot) must not paint a
  // harmless mob deadly, so treat it as an even fight until the real level
  // arrives.
  if (!Number.isFinite(playerLevel) || !Number.isFinite(enemyLevel) || enemyLevel <= 0) return 'fair';
  const delta = enemyLevel - playerLevel;
  return THREAT_BANDS.find((band) => delta >= band.minDelta)?.threat ?? 'fair';
}

type NameplateStyle = {
  /** Nameplate text colour. */
  color: string;
  /** World-space label height — trivial mobs shrink so a cleared zone quiets down. */
  height: number;
  /** Prefixed onto the name; only a real threat earns a marker. */
  prefix: string;
};

const THREAT_STYLES: Record<EnemyThreat, NameplateStyle> = {
  deadly: { color: '#f87171', height: 0.46, prefix: '☠ ' },
  high: { color: '#fb923c', height: 0.44, prefix: '' },
  fair: { color: '#fde68a', height: 0.42, prefix: '' },
  low: { color: '#86efac', height: 0.38, prefix: '' },
  trivial: { color: '#9ca3af', height: 0.34, prefix: '' },
};

/**
 * Nameplate treatment for a mob. A mini-boss keeps a larger plate on top of its
 * threat colour — the crown and beacon already say "boss", so the colour is
 * free to carry the more useful "can this kill me?" signal.
 */
export function threatNameplateStyle(threat: EnemyThreat, isMiniBoss: boolean): NameplateStyle {
  const style = THREAT_STYLES[threat];
  return isMiniBoss ? { ...style, height: style.height + 0.13, prefix: style.prefix } : style;
}
