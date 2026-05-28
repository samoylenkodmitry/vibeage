import { useMemo, useRef } from 'react';
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
  // Textures are cached + shared across instances (see getLabelTexture).
  // Combat spams repeated values ("8", "12", "12!"), and rebuilding a
  // canvas + re-uploading to the GPU for each duplicate was the main
  // churn during a fight. Do NOT dispose here — the cache owns the
  // texture's lifetime.
  const texture = useMemo(() => getLabelTexture(text, color, isCrit), [text, color, isCrit]);
  const aspect = texture.image.width / texture.image.height;
  const spriteRef = useRef<THREE.Sprite>(null);
  const matRef = useRef<THREE.SpriteMaterial>(null);
  const startedAtRef = useRef<number | null>(null);

  // Bigger hits get bigger numbers — clamps so a 1-damage tick
  // doesn't vanish and a 200-damage crit doesn't fill the screen.
  // Crits get an extra 1.45x bump so they pop on top of the
  // size-by-amount scaling.
  const baseHeight = THREE.MathUtils.clamp(0.45 + amount * 0.012, 0.45, 1.1);
  const height = isCrit ? baseHeight * 1.45 : baseHeight;

  useFrame(({ clock }) => {
    if (startedAtRef.current === null) startedAtRef.current = clock.elapsedTime;
    const age = clock.elapsedTime - startedAtRef.current;
    const t = Math.min(1, age / duration);
    if (spriteRef.current) {
      spriteRef.current.position.y = baseY + t * rise;
      // Spawn punch: overshoot the scale then settle back over the
      // first ~18% of the lifetime. Crits punch harder so a big hit
      // visibly "hits". Steady at 1× after the settle.
      const punchAmt = isCrit ? 0.6 : 0.28;
      const punch = t < 0.18 ? 1 + punchAmt * (1 - t / 0.18) : 1;
      spriteRef.current.scale.set(height * aspect * punch, height * punch, 1);
    }
    if (matRef.current) {
      // Pop in fast, fade out slower.
      matRef.current.opacity = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
    }
  });

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
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Soft glow underneath (warm for crits) so the number reads as "hot".
  ctx.shadowColor = isCrit ? 'rgba(120, 53, 15, 0.95)' : 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = isCrit ? 16 : 10;
  // Crisp dark outline so the colour stays legible over bright terrain
  // (a blurred shadow alone washes out on a sunny meadow). Drawn first
  // with the shadow, then the fill on top without re-applying shadow.
  ctx.lineJoin = 'round';
  ctx.lineWidth = isCrit ? 9 : 6;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
  ctx.strokeText(text, width / 2, height / 2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// Shared, bounded cache of damage-number textures. Combat repeats
// the same few strings constantly ("8", "12", "12!"), so caching by
// (text, color, isCrit) turns N hits of the same value into one
// canvas build + one GPU upload instead of N. Capped with simple
// FIFO eviction so a long session with thousands of distinct values
// (unlikely, but possible with big crits) can't grow unbounded —
// evicted textures are disposed.
const LABEL_TEXTURE_CACHE = new Map<string, THREE.CanvasTexture>();
const LABEL_TEXTURE_CACHE_MAX = 256;

function getLabelTexture(text: string, color: string, isCrit: boolean): THREE.CanvasTexture {
  const key = `${text}|${color}|${isCrit ? 'c' : 'n'}`;
  const cached = LABEL_TEXTURE_CACHE.get(key);
  if (cached) return cached;
  const texture = buildLabelTexture(text, color, isCrit);
  if (LABEL_TEXTURE_CACHE.size >= LABEL_TEXTURE_CACHE_MAX) {
    const oldestKey = LABEL_TEXTURE_CACHE.keys().next().value;
    if (oldestKey !== undefined) {
      LABEL_TEXTURE_CACHE.get(oldestKey)?.dispose();
      LABEL_TEXTURE_CACHE.delete(oldestKey);
    }
  }
  LABEL_TEXTURE_CACHE.set(key, texture);
  return texture;
}
