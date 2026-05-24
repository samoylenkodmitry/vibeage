import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type DamageNumberProps = {
  amount: number;
  color?: string;
  /** Total visible duration in seconds. */
  duration?: number;
  /** Starting world Y offset above the impact. */
  baseY?: number;
  /** Total world-space rise across the lifetime. */
  rise?: number;
  /** When true: bigger scale, exclamation suffix, longer rise. Drives the "crit!" damage-number variant. */
  isCrit?: boolean;
};

/**
 * Floating damage / heal number that rises and fades above an
 * impact. Built on the same CanvasTexture-sprite trick as
 * `NameLabel` so we avoid the drei/troika text dep cost.
 *
 * Uses `useFrame` to drive an y-offset + opacity over `duration`
 * seconds; mount-time `clock.elapsedTime` anchors the animation.
 */
export function DamageNumber({
  amount, color = '#fff7ad', duration = 0.95, baseY = 0.5, rise = 1.4, isCrit = false,
}: DamageNumberProps) {
  const text = useMemo(() => formatAmount(amount, isCrit), [amount, isCrit]);
  const texture = useMemo(() => buildLabelTexture(text, color, isCrit), [text, color, isCrit]);
  const aspect = texture.image.width / texture.image.height;
  const spriteRef = useRef<THREE.Sprite>(null);
  const matRef = useRef<THREE.SpriteMaterial>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(({ clock }) => {
    if (startedAtRef.current === null) startedAtRef.current = clock.elapsedTime;
    const age = clock.elapsedTime - startedAtRef.current;
    const t = Math.min(1, age / duration);
    if (spriteRef.current) {
      spriteRef.current.position.y = baseY + t * rise;
    }
    if (matRef.current) {
      // Pop in fast, fade out slower.
      matRef.current.opacity = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
    }
  });

  // Bigger hits get bigger numbers — clamps so a 1-damage tick
  // doesn't vanish and a 200-damage crit doesn't fill the screen.
  // Crits get an extra 1.45x bump so they pop on top of the
  // size-by-amount scaling.
  const baseHeight = THREE.MathUtils.clamp(0.45 + amount * 0.012, 0.45, 1.1);
  const height = isCrit ? baseHeight * 1.45 : baseHeight;
  return (
    <sprite ref={spriteRef} position={[0, baseY, 0]} scale={[height * aspect, height, 1]}>
      <spriteMaterial ref={matRef} map={texture} transparent depthTest={false} depthWrite={false} sizeAttenuation />
    </sprite>
  );
}

function formatAmount(amount: number, isCrit: boolean): string {
  const rounded = Math.round(amount);
  const base = rounded > 0 ? String(rounded) : '0';
  return isCrit ? `${base}!` : base;
}

const DMG_FONT = 'bold 72px "Inter", system-ui, -apple-system, sans-serif';
const DMG_FONT_CRIT = '900 84px "Inter", system-ui, -apple-system, sans-serif';
const DMG_PAD_X = 18;
const DMG_PAD_Y = 12;

function buildLabelTexture(text: string, color: string, isCrit: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);
  const font = isCrit ? DMG_FONT_CRIT : DMG_FONT;
  const textHeight = isCrit ? 84 : 72;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const width = textWidth + DMG_PAD_X * 2;
  const height = textHeight + DMG_PAD_Y * 2;
  canvas.width = width;
  canvas.height = height;
  // No pill background — damage numbers should pop, not sit in a chip.
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = isCrit ? 'rgba(120, 53, 15, 0.95)' : 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = isCrit ? 14 : 9;
  ctx.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
