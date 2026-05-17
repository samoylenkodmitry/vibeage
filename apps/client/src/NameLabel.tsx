import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

type NameLabelProps = {
  text: string;
  /** Hex colour for the text. */
  color?: string;
  /** World-space Y offset above the parent. */
  yOffset?: number;
  /** Display height in world units (label scales to keep this height). */
  height?: number;
};

/**
 * Billboard text label that always faces the camera.
 *
 * Generates a CanvasTexture once per (text, color) pair and maps it
 * onto a SpriteMaterial. The sprite scales horizontally based on the
 * rendered text width so labels for "Goblin" and "Mini-Boss Spectral
 * Treant" both look reasonable. No external text deps (drei/troika).
 */
export function NameLabel({
  text,
  color = '#f8fafc',
  yOffset = 1.6,
  height = 0.5,
}: NameLabelProps) {
  const texture = useMemo(() => buildLabelTexture(text, color), [text, color]);
  const aspect = texture.image.width / texture.image.height;

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return (
    <sprite position={[0, yOffset, 0]} scale={[height * aspect, height, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
        sizeAttenuation
      />
    </sprite>
  );
}

const LABEL_FONT = 'bold 64px "Inter", system-ui, -apple-system, sans-serif';
const LABEL_PADDING_X = 28;
const LABEL_PADDING_Y = 18;

function buildLabelTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Fallback empty texture if 2D context isn't available — shouldn't
    // happen in a normal browser but keeps types honest.
    return new THREE.CanvasTexture(canvas);
  }

  // Measure the text first so the canvas is just big enough.
  ctx.font = LABEL_FONT;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = 64; // matches the font size

  const width = textWidth + LABEL_PADDING_X * 2;
  const height = textHeight + LABEL_PADDING_Y * 2;
  canvas.width = width;
  canvas.height = height;

  // Translucent pill background so the label reads against any biome.
  ctx.fillStyle = 'rgba(5, 14, 18, 0.72)';
  ctx.beginPath();
  const radius = height / 2;
  ctx.moveTo(radius, 0);
  ctx.lineTo(width - radius, 0);
  ctx.arcTo(width, 0, width, radius, radius);
  ctx.lineTo(width, height - radius);
  ctx.arcTo(width, height, width - radius, height, radius);
  ctx.lineTo(radius, height);
  ctx.arcTo(0, height, 0, height - radius, radius);
  ctx.lineTo(0, radius);
  ctx.arcTo(0, 0, radius, 0, radius);
  ctx.closePath();
  ctx.fill();

  ctx.font = LABEL_FONT;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 6;
  ctx.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
