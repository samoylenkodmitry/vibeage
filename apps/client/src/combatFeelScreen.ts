/**
 * Screen-space maths for the combat feel layer: how close to death the player
 * is, and where on the screen edge a blow came from. Kept apart from the
 * component so both can be reasoned about (and tested) as plain numbers.
 */

/**
 * Below this share of the health bar the danger vignette starts to bleed in.
 * Roughly "one more exchange could go badly" at this game's damage scale — high
 * enough to be a warning, low enough that normal chip damage never tints the
 * screen.
 */
const DANGER_START_RATIO = 0.45;
/**
 * Peak vignette opacity. Deliberately well under 1: this is a frame around the
 * picture, never a filter over it — the HUD and the mob under the cursor stay
 * fully readable at death's door.
 */
const DANGER_MAX_OPACITY = 0.72;
/** Above this the vignette starts beating; below it, it just sits there. */
const DANGER_HEARTBEAT_FROM = 0.45;
/** Heartbeat period at the edge of the danger band … */
const DANGER_HEARTBEAT_SLOW_MS = 1500;
/** … and at one hit from death. A resting pulse speeding up to a panicked one. */
const DANGER_HEARTBEAT_FAST_MS = 620;

/** 0 = safe, 1 = one hit from death. Dead players get 0 — the death overlay owns that. */
export function dangerLevel(health: number | undefined, maxHealth: number | undefined, isAlive: boolean | undefined): number {
  if (!isAlive || !maxHealth || maxHealth <= 0 || health === undefined) return 0;
  const ratio = Math.max(0, Math.min(1, health / maxHealth));
  if (ratio >= DANGER_START_RATIO) return 0;
  return (DANGER_START_RATIO - ratio) / DANGER_START_RATIO;
}

/** Vignette opacity for a danger level. */
export function dangerOpacity(level: number): number {
  return level * DANGER_MAX_OPACITY;
}

/** Heartbeat period in ms, or null when the danger isn't severe enough to beat. */
export function dangerHeartbeatMs(level: number): number | null {
  if (level < DANGER_HEARTBEAT_FROM) return null;
  const t = (level - DANGER_HEARTBEAT_FROM) / (1 - DANGER_HEARTBEAT_FROM);
  return Math.round(DANGER_HEARTBEAT_SLOW_MS + (DANGER_HEARTBEAT_FAST_MS - DANGER_HEARTBEAT_SLOW_MS) * t);
}

/**
 * CSS gradient angle (deg, 0 = toward the top of the screen) for a blow that
 * travelled along world direction (dirX, dirZ) while the camera orbits at
 * `cameraAngle`.
 *
 * The rig looks along (sin a, cos a) with right-hand (cos a, -sin a) — see
 * getCameraOrbitPosition — so those two dots project the world vector onto the
 * screen. The gradient runs the way the blow ran, which leaves its bright end
 * on the edge the attacker is standing behind.
 */
export function screenAngleFromWorldDirection(dirX: number, dirZ: number, cameraAngle: number): number {
  if (dirX === 0 && dirZ === 0) return DEFAULT_FLASH_ANGLE;
  const right = dirX * Math.cos(cameraAngle) - dirZ * Math.sin(cameraAngle);
  const up = dirX * Math.sin(cameraAngle) + dirZ * Math.cos(cameraAngle);
  const deg = (Math.atan2(right, up) * 180) / Math.PI;
  return Math.round(((deg % 360) + 360) % 360);
}

/** Direction-less hits flash from the bottom — "something hit you", no bearing. */
const DEFAULT_FLASH_ANGLE = 0;
