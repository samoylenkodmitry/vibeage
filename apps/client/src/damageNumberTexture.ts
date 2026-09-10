import * as THREE from 'three';

/**
 * Canvas-sprite glyphs for floating combat numbers. Split out of DamageNumber
 * so the component stays about motion and this file stays about legibility —
 * the two get tuned for different reasons.
 *
 * Built on the same CanvasTexture trick as `NameLabel` (no drei/troika text
 * dependency), with a shared bounded cache: combat repeats the same handful of
 * strings constantly ("8", "-12", "142!"), so keying on the rendered form turns
 * N identical hits into one canvas build and one GPU upload.
 */

/**
 * How a number reads at a glance, before you parse the digits. Each variant
 * owns a shape (sigil + weight + glow) as well as a colour, because colour
 * alone fails on a bright meadow and for colour-blind players.
 */
export type DamageNumberVariant = 'outgoing' | 'incoming' | 'heal' | 'crit';

type VariantStyle = {
  /** Canvas font shorthand. */
  font: string;
  /** Cap height in px — the canvas is sized from it. */
  size: number;
  /** Prefix sigil: "-" you took it, "+" you gained it, "" you dealt it. */
  sigil: string;
  /** Suffix — crits shout. */
  suffix: string;
  /** Halo behind the glyph; warm on crits so a big hit reads as hot. */
  glow: string;
  glowBlur: number;
  outline: number;
};

// Weights climb with how much the player needs to notice the number: outgoing
// damage is the background hum of combat, incoming is a warning, a crit is an
// event. Sizes stay inside a 72–96 px band so the sprite atlas cost is flat.
const VARIANT_STYLES: Record<DamageNumberVariant, VariantStyle> = {
  outgoing: { font: 'bold 72px "Inter", system-ui, -apple-system, sans-serif', size: 72, sigil: '', suffix: '', glow: 'rgba(0, 0, 0, 0.95)', glowBlur: 10, outline: 6 },
  incoming: { font: '800 78px "Inter", system-ui, -apple-system, sans-serif', size: 78, sigil: '-', suffix: '', glow: 'rgba(76, 5, 5, 0.95)', glowBlur: 14, outline: 7 },
  heal: { font: 'bold 72px "Inter", system-ui, -apple-system, sans-serif', size: 72, sigil: '+', suffix: '', glow: 'rgba(4, 47, 24, 0.9)', glowBlur: 12, outline: 6 },
  crit: { font: '900 96px "Inter", system-ui, -apple-system, sans-serif', size: 96, sigil: '', suffix: '!', glow: 'rgba(120, 53, 15, 0.95)', glowBlur: 18, outline: 10 },
};

const PAD_X = 18;
const PAD_Y = 12;

/** The exact string a variant renders for an amount — also the cache key part. */
export function formatDamageAmount(amount: number, variant: DamageNumberVariant): string {
  const style = VARIANT_STYLES[variant];
  const rounded = Math.max(0, Math.round(amount));
  return `${style.sigil}${rounded}${style.suffix}`;
}

function buildLabelTexture(text: string, color: string, variant: DamageNumberVariant): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);
  const style = VARIANT_STYLES[variant];
  ctx.font = style.font;
  const width = Math.ceil(ctx.measureText(text).width) + PAD_X * 2;
  const height = style.size + PAD_Y * 2;
  canvas.width = width;
  canvas.height = height;
  // No pill background — combat numbers should pop, not sit in a chip.
  ctx.font = style.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = style.glow;
  ctx.shadowBlur = style.glowBlur;
  // Crisp dark outline so the colour stays legible over bright terrain (a
  // blurred shadow alone washes out on a sunny meadow). Stroked first with the
  // shadow, then the fill on top with the shadow off.
  ctx.lineJoin = 'round';
  ctx.lineWidth = style.outline;
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

// Capped with simple FIFO eviction so a long session with thousands of distinct
// values can't grow unbounded — evicted textures are disposed. Callers must NOT
// dispose what they get back: the cache owns the lifetime.
const LABEL_TEXTURE_CACHE = new Map<string, THREE.CanvasTexture>();
const LABEL_TEXTURE_CACHE_MAX = 256;

export function getDamageNumberTexture(text: string, color: string, variant: DamageNumberVariant): THREE.CanvasTexture {
  const key = `${text}|${color}|${variant}`;
  const cached = LABEL_TEXTURE_CACHE.get(key);
  if (cached) return cached;
  const texture = buildLabelTexture(text, color, variant);
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
