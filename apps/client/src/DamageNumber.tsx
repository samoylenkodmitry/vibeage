import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { claimDamageNumberLane } from './damageNumberLanes';
import { formatDamageAmount, getDamageNumberTexture, type DamageNumberVariant } from './damageNumberTexture';
import { sampleNumberMotion, VARIANT_MOTION } from './damageNumberMotion';
import { motionGain } from './combatFeel';

type DamageNumberProps = {
  amount: number;
  color?: string;
  /** Total visible duration in seconds. Defaults per variant. */
  duration?: number;
  /** Starting world Y offset above the impact. */
  baseY?: number;
  /** Total world-space rise across the lifetime. */
  rise?: number;
  /** Legacy switch kept for callers that only know "was it a crit" — maps to the crit variant. */
  isCrit?: boolean;
  /** How the number reads at a glance. Wins over `isCrit` when both are given. */
  variant?: DamageNumberVariant;
};

/**
 * Floating combat number that rises and fades above an impact.
 *
 * Three things make it *read* mid-fight: the variant (outgoing / incoming /
 * heal / crit each carry their own sigil, weight, colour and motion arc — see
 * damageNumberTexture), the lane it claims on spawn so a flurry fans out
 * instead of stacking into a blob, and the spawn punch that ties the glyph to
 * the moment of contact.
 *
 * `useFrame` drives it; mount-time `clock.elapsedTime` anchors the animation.
 */
export function DamageNumber({
  amount, color = '#fff7ad', duration, baseY = 0.5, rise = 1.4, isCrit = false, variant,
}: DamageNumberProps) {
  const kind: DamageNumberVariant = variant ?? (isCrit ? 'crit' : 'outgoing');
  const text = useMemo(() => formatDamageAmount(amount, kind), [amount, kind]);
  // Textures are cached + shared across instances — do NOT dispose here.
  const texture = useMemo(() => getDamageNumberTexture(text, color, kind), [text, color, kind]);
  const aspect = texture.image.width / texture.image.height;
  const spriteRef = useRef<THREE.Sprite>(null);
  const matRef = useRef<THREE.SpriteMaterial>(null);
  const startedAtRef = useRef<number | null>(null);
  // Lane + motion budget are decided once, on spawn: a number that changed
  // lanes or amplitude mid-flight would read as a glitch.
  const lane = useMemo(() => claimDamageNumberLane(typeof performance !== 'undefined' ? performance.now() : Date.now()), []);
  const gain = useMemo(() => motionGain(), []);

  // Bigger hits get bigger numbers — clamped so a 1-damage tick doesn't vanish
  // and a 200-damage crit doesn't fill the screen. Crits take an extra bump on
  // top so they pop above the size-by-amount scaling.
  const style = VARIANT_MOTION[kind];
  const height = THREE.MathUtils.clamp(0.45 + amount * 0.012, 0.45, 1.1) * style.sizeBoost;
  const life = duration ?? style.duration;

  useFrame(({ clock }) => {
    if (startedAtRef.current === null) startedAtRef.current = clock.elapsedTime;
    const age = clock.elapsedTime - startedAtRef.current - lane.delay;
    const sprite = spriteRef.current;
    const material = matRef.current;
    if (age < 0) {
      // Still queued behind its lane's stagger — stay invisible rather than
      // sitting fully-formed at the spawn point.
      if (material) material.opacity = 0;
      return;
    }
    const t = Math.min(1, age / life);
    const motion = sampleNumberMotion(kind, t, gain);
    if (sprite) {
      sprite.position.set(
        lane.offsetX + lane.driftX * motion.ease + motion.offsetX,
        baseY + lane.offsetY + motion.offsetY * rise,
        0,
      );
      sprite.scale.set(height * aspect * motion.scale, height * motion.scale, 1);
    }
    if (material) {
      material.opacity = motion.opacity;
      material.rotation = motion.rotation;
    }
  });

  return (
    <sprite ref={spriteRef} position={[lane.offsetX, baseY + lane.offsetY, 0]} scale={[height * aspect, height, 1]}>
      <spriteMaterial ref={matRef} map={texture} transparent opacity={0} depthTest={false} depthWrite={false} sizeAttenuation />
    </sprite>
  );
}

