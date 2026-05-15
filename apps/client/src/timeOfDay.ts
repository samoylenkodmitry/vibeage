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

type Rgb = { r: number; g: number; b: number };

type ParsedKeyframe = {
  phase: number;
  sunIntensity: number;
  hemisphereIntensity: number;
  cloudOpacity: number;
  sunColor: Rgb;
  hemisphereSky: Rgb;
  hemisphereGround: Rgb;
  fogColor: Rgb;
  backgroundColor: Rgb;
  cloudColor: Rgb;
};

const KEYFRAMES: Keyframe[] = [
  {
    phase: 0,
    sunColor: '#ffb27a',
    sunIntensity: 0.95,
    hemisphereSky: '#ffd1a5',
    hemisphereGround: '#3a2d2a',
    hemisphereIntensity: 0.7,
    fogColor: '#3a2740',
    backgroundColor: '#2a1f33',
    cloudColor: '#ffd9b8',
    cloudOpacity: 0.4,
  },
  {
    phase: 0.32,
    sunColor: '#fff1a6',
    sunIntensity: 1.55,
    hemisphereSky: '#ccecff',
    hemisphereGround: '#21402d',
    hemisphereIntensity: 0.85,
    fogColor: '#a4d2e3',
    backgroundColor: '#7fb6dd',
    cloudColor: '#dff8ff',
    cloudOpacity: 0.3,
  },
  {
    phase: 0.7,
    sunColor: '#ff8a4d',
    sunIntensity: 0.85,
    hemisphereSky: '#ff8a5b',
    hemisphereGround: '#2a1320',
    hemisphereIntensity: 0.55,
    fogColor: '#3d1f2c',
    backgroundColor: '#1f1226',
    cloudColor: '#ff9466',
    cloudOpacity: 0.46,
  },
  {
    phase: 0.86,
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

const SUN_PHASE_ANGLES: ReadonlyArray<{ phase: number; angle: number }> = [
  { phase: 0, angle: 0 },
  { phase: 0.32, angle: Math.PI / 2 },
  { phase: 0.7, angle: Math.PI },
  { phase: 0.86, angle: Math.PI * 1.5 },
  { phase: 1, angle: Math.PI * 2 },
];

function phaseToSunAngle(phase: number): number {
  for (let i = 1; i < SUN_PHASE_ANGLES.length; i += 1) {
    if (phase < SUN_PHASE_ANGLES[i].phase) {
      const span = SUN_PHASE_ANGLES[i].phase - SUN_PHASE_ANGLES[i - 1].phase;
      const t = span > 0 ? (phase - SUN_PHASE_ANGLES[i - 1].phase) / span : 0;
      return SUN_PHASE_ANGLES[i - 1].angle + (SUN_PHASE_ANGLES[i].angle - SUN_PHASE_ANGLES[i - 1].angle) * t;
    }
  }
  return Math.PI * 2;
}

export function computeSunDirection(phase: number): Vec3 {
  const angle = phaseToSunAngle(phase);
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

const PARSED_KEYFRAMES: ParsedKeyframe[] = KEYFRAMES.map((frame) => ({
  phase: frame.phase,
  sunIntensity: frame.sunIntensity,
  hemisphereIntensity: frame.hemisphereIntensity,
  cloudOpacity: frame.cloudOpacity,
  sunColor: parseHex(frame.sunColor),
  hemisphereSky: parseHex(frame.hemisphereSky),
  hemisphereGround: parseHex(frame.hemisphereGround),
  fogColor: parseHex(frame.fogColor),
  backgroundColor: parseHex(frame.backgroundColor),
  cloudColor: parseHex(frame.cloudColor),
}));

function interpolateKeyframes(phase: number): Omit<DayPhasePalette, 'sunDir'> {
  const sorted = PARSED_KEYFRAMES;
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
    sunColor: lerpRgbHex(prev.sunColor, next.sunColor, t),
    sunIntensity: lerp(prev.sunIntensity, next.sunIntensity, t),
    hemisphereSky: lerpRgbHex(prev.hemisphereSky, next.hemisphereSky, t),
    hemisphereGround: lerpRgbHex(prev.hemisphereGround, next.hemisphereGround, t),
    hemisphereIntensity: lerp(prev.hemisphereIntensity, next.hemisphereIntensity, t),
    fogColor: lerpRgbHex(prev.fogColor, next.fogColor, t),
    backgroundColor: lerpRgbHex(prev.backgroundColor, next.backgroundColor, t),
    cloudColor: lerpRgbHex(prev.cloudColor, next.cloudColor, t),
    cloudOpacity: lerp(prev.cloudOpacity, next.cloudOpacity, t),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgbHex(a: Rgb, b: Rgb, t: number): string {
  const r = Math.round(lerp(a.r, b.r, t));
  const g = Math.round(lerp(a.g, b.g, t));
  const blue = Math.round(lerp(a.b, b.b, t));
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(blue)}`;
}

function parseHex(value: string): Rgb {
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
