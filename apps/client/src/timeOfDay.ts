export const DEFAULT_DAY_DURATION_MS = 12 * 60 * 1000;
export const SUN_DISTANCE = 540;

export type Vec3 = { x: number; y: number; z: number };

export type DayPhasePalette = {
  phase: number;
  sunDir: Vec3;
  sunColor: string;
  sunIntensity: number;
  hemisphereSky: string;
  hemisphereGround: string;
  hemisphereIntensity: number;
  fogColor: string;
  backgroundColor: string;
  cloudColor: string;
  cloudOpacity: number;
};

type Keyframe = Omit<DayPhasePalette, 'sunDir'>;

const KEYFRAMES: Keyframe[] = [
  {
    phase: 0,
    sunColor: '#ffb27a',
    sunIntensity: 0.85,
    hemisphereSky: '#ffd1a5',
    hemisphereGround: '#3a2d2a',
    hemisphereIntensity: 0.62,
    fogColor: '#3a2740',
    backgroundColor: '#2a1f33',
    cloudColor: '#ffd9b8',
    cloudOpacity: 0.42,
  },
  {
    phase: 0.25,
    sunColor: '#fff1a6',
    sunIntensity: 1.55,
    hemisphereSky: '#ccecff',
    hemisphereGround: '#21402d',
    hemisphereIntensity: 0.82,
    fogColor: '#a4d2e3',
    backgroundColor: '#7fb6dd',
    cloudColor: '#dff8ff',
    cloudOpacity: 0.3,
  },
  {
    phase: 0.5,
    sunColor: '#ff8a4d',
    sunIntensity: 0.78,
    hemisphereSky: '#ff8a5b',
    hemisphereGround: '#2a1320',
    hemisphereIntensity: 0.52,
    fogColor: '#3d1f2c',
    backgroundColor: '#1f1226',
    cloudColor: '#ff9466',
    cloudOpacity: 0.46,
  },
  {
    phase: 0.75,
    sunColor: '#7d8bb0',
    sunIntensity: 0.18,
    hemisphereSky: '#0c1530',
    hemisphereGround: '#050a14',
    hemisphereIntensity: 0.22,
    fogColor: '#040912',
    backgroundColor: '#020611',
    cloudColor: '#101a30',
    cloudOpacity: 0.55,
  },
];

export function normalizePhase(timestampMs: number, dayDurationMs: number = DEFAULT_DAY_DURATION_MS): number {
  if (dayDurationMs <= 0 || !Number.isFinite(timestampMs)) {
    return 0;
  }
  const wrapped = timestampMs - Math.floor(timestampMs / dayDurationMs) * dayDurationMs;
  return wrapped / dayDurationMs;
}

export function computeSunDirection(phase: number): Vec3 {
  const angle = phase * Math.PI * 2;
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  const z = -0.42;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

export function computeDayPhase(timestampMs: number, dayDurationMs: number = DEFAULT_DAY_DURATION_MS): DayPhasePalette {
  const phase = normalizePhase(timestampMs, dayDurationMs);
  const palette = interpolateKeyframes(phase);
  return {
    ...palette,
    phase,
    sunDir: computeSunDirection(phase),
  };
}

function interpolateKeyframes(phase: number): Omit<DayPhasePalette, 'sunDir'> {
  const sorted = KEYFRAMES;
  let next = sorted[0];
  let prev = sorted[sorted.length - 1];
  let prevPhase = prev.phase - 1;
  for (const frame of sorted) {
    if (frame.phase <= phase) {
      prev = frame;
      prevPhase = frame.phase;
    } else {
      next = frame;
      break;
    }
  }
  if (prevPhase >= phase) {
    next = sorted[(sorted.indexOf(prev) + 1) % sorted.length];
  }
  let nextPhase = next.phase;
  if (nextPhase <= prevPhase) {
    nextPhase += 1;
  }
  const span = nextPhase - prevPhase;
  const t = span > 0 ? (phase - prevPhase) / span : 0;

  return {
    phase,
    sunColor: lerpHex(prev.sunColor, next.sunColor, t),
    sunIntensity: lerp(prev.sunIntensity, next.sunIntensity, t),
    hemisphereSky: lerpHex(prev.hemisphereSky, next.hemisphereSky, t),
    hemisphereGround: lerpHex(prev.hemisphereGround, next.hemisphereGround, t),
    hemisphereIntensity: lerp(prev.hemisphereIntensity, next.hemisphereIntensity, t),
    fogColor: lerpHex(prev.fogColor, next.fogColor, t),
    backgroundColor: lerpHex(prev.backgroundColor, next.backgroundColor, t),
    cloudColor: lerpHex(prev.cloudColor, next.cloudColor, t),
    cloudOpacity: lerp(prev.cloudOpacity, next.cloudOpacity, t),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const r = Math.round(lerp(ca.r, cb.r, t));
  const g = Math.round(lerp(ca.g, cb.g, t));
  const blue = Math.round(lerp(ca.b, cb.b, t));
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(blue)}`;
}

function parseHex(value: string): { r: number; g: number; b: number } {
  const hex = value.startsWith('#') ? value.slice(1) : value;
  const expanded = hex.length === 3
    ? hex.split('').map((ch) => ch + ch).join('')
    : hex;
  const intValue = parseInt(expanded, 16);
  return {
    r: (intValue >> 16) & 0xff,
    g: (intValue >> 8) & 0xff,
    b: intValue & 0xff,
  };
}

function toHexByte(value: number): string {
  const clamped = Math.max(0, Math.min(255, value));
  return clamped.toString(16).padStart(2, '0');
}
