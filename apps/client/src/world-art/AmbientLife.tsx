import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { computeDayPhase } from '../timeOfDay';
import { getTerrainY } from '../worldSceneConfig';
import type { Vec3 } from '../gameTypes';

/**
 * Global ambient life — the moving specks that make the air feel inhabited
 * everywhere, not just at the cozy spawn coast: warm butterflies by day,
 * pulsing fireflies by night, and sunlit pollen motes drifting close around
 * the player. All three layers follow the player (a particle that falls too
 * far behind quietly respawns ahead near the focus), hug the real terrain
 * height, and fade with the day phase. One Points draw per colour slice;
 * per-frame cost is a few dozen position writes.
 */
const BUTTERFLY_COLORS = ['#ff8a4a', '#ffd24c', '#f6a3c9'];
const BUTTERFLY_COUNT = 18; // across all colour slices
const FIREFLY_COUNT = 22;
const POLLEN_COUNT = 36;

type Mote = {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  phase: number;
};

type LayerSpec = {
  count: number;
  range: number;            // wander radius around the focus
  heightMin: number;        // band above terrain
  heightMax: number;
  speed: number;
  turnChance: number;
};

// One slice per butterfly colour — a static per-slice spec keeps MoteLayer
// props reference-stable across the per-tick re-renders (review).
const BUTTERFLY_SLICE_SPEC: LayerSpec = {
  count: Math.ceil(BUTTERFLY_COUNT / BUTTERFLY_COLORS.length),
  range: 30, heightMin: 0.4, heightMax: 2.4, speed: 1.4, turnChance: 0.04,
};
const FIREFLY_SPEC: LayerSpec = { count: FIREFLY_COUNT, range: 28, heightMin: 0.5, heightMax: 2.4, speed: 0.8, turnChance: 0.02 };
const POLLEN_SPEC: LayerSpec = { count: POLLEN_COUNT, range: 18, heightMin: 0.3, heightMax: 3.2, speed: 0.35, turnChance: 0.06 };

export function AmbientLife({ focus }: { focus: Vec3 }) {
  // Latest-ref: the sim reads the freshest focus inside useFrame without the
  // particle arrays depending on the (per-tick) focus prop identity.
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const daynessRef = useRef(1);
  const nightnessRef = useRef(0);
  const lastPhaseAtRef = useRef(0);
  useFrame(() => {
    // The day phase moves over minutes — sampling it at 4 Hz is plenty.
    const now = performance.now();
    if (now - lastPhaseAtRef.current < 250) return;
    lastPhaseAtRef.current = now;
    const sunY = computeDayPhase(Date.now()).sunDir.y;
    daynessRef.current = smoothstep(-0.05, 0.2, sunY);
    nightnessRef.current = 1 - daynessRef.current;
  });
  return (
    <>
      {BUTTERFLY_COLORS.map((color, i) => (
        <MoteLayer
          key={`bf-${i}`}
          spec={BUTTERFLY_SLICE_SPEC}
          seed={4441 + i * 131}
          color={color}
          fadeRef={daynessRef}
          focusRef={focusRef}
          size={9}
          flutterHz={12}
        />
      ))}
      <MoteLayer spec={FIREFLY_SPEC} seed={8191} color="#ffd089" fadeRef={nightnessRef} focusRef={focusRef} size={16} pulseHz={1.4} additive />
      <MoteLayer spec={POLLEN_SPEC} seed={2741} color="#fff7df" fadeRef={daynessRef} focusRef={focusRef} size={5} maxOpacity={0.3} additive />
    </>
  );
}

function MoteLayer({ spec, seed, color, fadeRef, focusRef, size, flutterHz, pulseHz, maxOpacity = 1, additive }: {
  spec: LayerSpec;
  seed: number;
  color: string;
  fadeRef: React.MutableRefObject<number>;
  focusRef: React.MutableRefObject<Vec3>;
  size: number;
  flutterHz?: number;
  pulseHz?: number;
  maxOpacity?: number;
  additive?: boolean;
}) {
  const rand = useMemo(() => mulberry32(seed), [seed]);
  const motes = useMemo<Mote[]>(() => Array.from({ length: spec.count }, () => ({
    x: Number.NaN, y: 0, z: 0, vx: 0, vy: 0, vz: 0, phase: rand() * Math.PI * 2,
  })), [spec.count, rand]);
  const positions = useMemo(() => new Float32Array(spec.count * 3), [spec.count]);
  const opacities = useMemo(() => new Float32Array(spec.count), [spec.count]);
  const geometryRef = useRef<THREE.BufferGeometry>(null);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const focus = focusRef.current;
    const fade = fadeRef.current;
    const now = performance.now() / 1000;
    for (let i = 0; i < motes.length; i += 1) {
      const m = motes[i];
      const dx = m.x - focus.x;
      const dz = m.z - focus.z;
      // NaN seed positions and left-behind motes respawn near the focus.
      if (!Number.isFinite(m.x) || dx * dx + dz * dz > spec.range * spec.range * 2) {
        const a = rand() * Math.PI * 2;
        const r = spec.range * (0.3 + rand() * 0.6);
        m.x = focus.x + Math.cos(a) * r;
        m.z = focus.z + Math.sin(a) * r;
        m.y = getTerrainY(m.x, m.z) + spec.heightMin + rand() * (spec.heightMax - spec.heightMin);
        const a0 = rand() * Math.PI * 2;
        m.vx = Math.cos(a0) * spec.speed;
        m.vz = Math.sin(a0) * spec.speed;
        m.vy = (rand() - 0.5) * spec.speed * 0.4;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.z += m.vz * dt;
      // dt-scaled so the turn frequency is framerate-independent (review).
      if (rand() < spec.turnChance * 60 * dt) {
        const a = rand() * Math.PI * 2;
        m.vx = Math.cos(a) * spec.speed;
        m.vz = Math.sin(a) * spec.speed;
        m.vy = (rand() - 0.5) * spec.speed * 0.5;
      }
      // Steer home when drifting past the wander ring; hug the terrain band.
      const dist = Math.hypot(m.x - focus.x, m.z - focus.z);
      if (dist > spec.range) {
        m.vx = ((focus.x - m.x) / dist) * spec.speed;
        m.vz = ((focus.z - m.z) / dist) * spec.speed;
      }
      const ground = getTerrainY(m.x, m.z);
      if (m.y < ground + spec.heightMin) m.vy = Math.abs(m.vy);
      if (m.y > ground + spec.heightMax) m.vy = -Math.abs(m.vy);
      positions[i * 3] = m.x;
      positions[i * 3 + 1] = m.y;
      positions[i * 3 + 2] = m.z;
      const flutter = flutterHz ? 0.6 + 0.4 * Math.abs(Math.sin(now * flutterHz + m.phase)) : 1;
      const pulse = pulseHz ? 0.6 + 0.4 * Math.sin(now * pulseHz * Math.PI * 2 + m.phase) : 1;
      opacities[i] = fade * flutter * pulse * maxOpacity;
    }
    const g = geometryRef.current;
    if (g) {
      g.attributes.position.needsUpdate = true;
      g.attributes.opacity.needsUpdate = true;
    }
  });

  // Stable uniforms object — recreating it per render churns material state.
  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(color) },
    uSize: { value: size },
  }), [color, size]);

  return (
    <points frustumCulled={false} raycast={() => null}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-opacity" args={[opacities, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
        uniforms={uniforms}
        vertexShader={moteVertexShader}
        fragmentShader={moteFragmentShader}
      />
    </points>
  );
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const moteVertexShader = `
  attribute float opacity;
  uniform float uSize;
  varying float vOpacity;
  void main() {
    vOpacity = opacity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * (20.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const moteFragmentShader = `
  varying float vOpacity;
  uniform vec3 uColor;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float dist = length(d);
    float soft = 1.0 - smoothstep(0.10, 0.50, dist);
    if (soft <= 0.0 || vOpacity <= 0.004) discard;
    gl_FragColor = vec4(uColor, soft * vOpacity);
  }
`;
