export const DEFAULT_DAY_DURATION_MS = 12 * 60 * 1000;
export const SUN_DISTANCE = 540;

export type Vec3 = { x: number; y: number; z: number };

export type DayPhasePalette = {
  phase: number;
  sunDir: Vec3;
  moonDir: Vec3;
  sunColor: string;
  sunIntensity: number;
  hemisphereSky: string;
  hemisphereGround: string;
  hemisphereIntensity: number;
  // Uniform fill so the ground near the camera stays readable when the sun is
  // low (dawn/dusk) or absent (night) — without it the foreground crushes to
  // near-black while fog washes the lit distance. Higher when the sun can't do
  // the work, minimal at midday.
  ambientIntensity: number;
  fogColor: string;
  backgroundColor: string;
  cloudColor: string;
  cloudOpacity: number;
};

type Keyframe = Omit<DayPhasePalette, 'sunDir' | 'moonDir'>;

type Rgb = { r: number; g: number; b: number };

type ParsedKeyframe = {
  phase: number;
  sunIntensity: number;
  hemisphereIntensity: number;
  ambientIntensity: number;
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
    sunIntensity: 1.25,
    hemisphereSky: '#ffd1a5',
    hemisphereGround: '#6b5a50',
    hemisphereIntensity: 1.12,
    // Twilight ground legibility is INTRINSIC (same lesson as night): at
    // dawn/dusk the sun grazes the horizon and lights nothing, and the moon
    // is exactly at the opposite horizon — ambient/hemisphere are the only
    // sources, so they carry a readable warm base on their own.
    ambientIntensity: 0.78,
    fogColor: '#5e4768',
    backgroundColor: '#473652',
    cloudColor: '#ffd9b8',
    cloudOpacity: 0.4,
  },
  {
    phase: 0.32,
    sunColor: '#fff1a6',
    sunIntensity: 1.7,
    hemisphereSky: '#ccecff',
    hemisphereGround: '#21402d',
    hemisphereIntensity: 1.15,
    ambientIntensity: 0.22,
    fogColor: '#a4d2e3',
    backgroundColor: '#7fb6dd',
    cloudColor: '#dff8ff',
    cloudOpacity: 0.3,
  },
  {
    phase: 0.7,
    sunColor: '#ff8a4d',
    sunIntensity: 1.35,
    hemisphereSky: '#ff9e72',
    hemisphereGround: '#6b5260',
    hemisphereIntensity: 1.12,
    // See dawn note — twilight ground lives on ambient/hemisphere alone.
    ambientIntensity: 0.82,
    fogColor: '#6e4a5a',
    backgroundColor: '#4a3050',
    cloudColor: '#ff9466',
    cloudOpacity: 0.46,
  },
  {
    phase: 0.86,
    // Night brightness is INTRINSIC now — round three of "night is black"
    // (user, on a phone with no HDR headroom). Earlier rounds leaned on the
    // adaptive tone map to lift the scene; that proved unreliable across
    // devices, so the night keyframe itself carries a bright moonlit-blue
    // base: stronger hemisphere + ambient, lighter sky/ground tints. Still
    // clearly night (cool, blue, below day), but everything is readable
    // with NO tone-mapping help at all.
    sunColor: '#cad6f0',
    // Moonlit "sun" stand-in — since #869 it shines from the MOON's actual
    // direction, so this intensity finally does real work at night.
    // sun/hemisphere stay just below their midday values (the timeOfDay spec
    // pins day > night on BOTH); the extra night light rides on ambient,
    // which is unconstrained and lifts everything uniformly.
    sunIntensity: 1.6,
    hemisphereSky: '#7a93cf',
    hemisphereGround: '#4d6494',
    hemisphereIntensity: 1.13,
    ambientIntensity: 0.95,
    fogColor: '#3d5c99',
    backgroundColor: '#35508d',
    cloudColor: '#7f9ad0',
    cloudOpacity: 0.5,
  },
];

/**
 * 0 in daylight → 1 in deep night, eased from the sun's elevation (`sunDir.y`).
 * The sun grazes the horizon (`y≈0`) at dawn/dusk and sits at `y≈±0.92` at
 * noon/midnight, so this reads ~0.3 through twilight and 1 once it's fully down.
 * Drives the post night grade (desaturate + cool the world after dark) so the
 * scene mutes to moonlight instead of staying daytime-vivid under the blue night.
 */
export function nightFactorFromSunDir(sunDirY: number): number {
  const day = 0.15;   // sun this high or higher → full daylight (factor 0)
  const night = -0.25; // sun this low or lower → full night (factor 1)
  const t = Math.max(0, Math.min(1, (day - sunDirY) / (day - night)));
  return t * t * (3 - 2 * t); // smoothstep
}

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

function computeMoonDirection(phase: number): Vec3 {
  const angle = phaseToSunAngle(phase) + Math.PI;
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  const z = 0.32;
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
    moonDir: computeMoonDirection(phase),
  };
}

const PARSED_KEYFRAMES: ParsedKeyframe[] = KEYFRAMES.map((frame) => ({
  phase: frame.phase,
  sunIntensity: frame.sunIntensity,
  hemisphereIntensity: frame.hemisphereIntensity,
  ambientIntensity: frame.ambientIntensity,
  cloudOpacity: frame.cloudOpacity,
  sunColor: parseHex(frame.sunColor),
  hemisphereSky: parseHex(frame.hemisphereSky),
  hemisphereGround: parseHex(frame.hemisphereGround),
  fogColor: parseHex(frame.fogColor),
  backgroundColor: parseHex(frame.backgroundColor),
  cloudColor: parseHex(frame.cloudColor),
}));

function interpolateKeyframes(phase: number): Omit<DayPhasePalette, 'sunDir' | 'moonDir'> {
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
    ambientIntensity: lerp(prev.ambientIntensity, next.ambientIntensity, t),
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
