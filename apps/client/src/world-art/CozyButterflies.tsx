import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { computeDayPhase } from '../timeOfDay';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Daytime butterflies drifting in the cozy meadow. Visible when
 * the sun is up (opposite of NightStars / CozyFireflies). Each
 * butterfly does a slow random walk inside the inland grass area
 * with a tiny vertical bob; warm colors (orange/yellow/pink) so
 * they pop against the green ground.
 */
const COUNT = 14;
const WANDER_SPEED = 1.4;
const HEIGHT_BAND = { min: 0.6, max: 2.6 };
const COLORS = ['#ff8a4a', '#ffd24c', '#f6a3c9'];

type Butterfly = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  flapPhase: number;
  colorIndex: number;
};

export function CozyButterflies({ scene }: { scene: WorldArtScene }) {
  const butterflies = useMemo<Butterfly[]>(() => makeButterflies(scene), [scene]);
  const rand = useMemo(() => mulberry32(scene.id.length * 4441 + 2), [scene]);
  // The parent owns the SIMULATION only: it mutates the shared Butterfly
  // objects in place (the slices render from those by reference) and tracks
  // dayness in a ref so each slice can fade out at night without recomputing
  // the palette. No geometry of its own — slices do the drawing.
  const daynessRef = useRef(1);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const palette = computeDayPhase(Date.now());
    daynessRef.current = clamp(smoothstep(-0.05, 0.20, palette.sunDir.y), 0, 1);
    for (let i = 0; i < butterflies.length; i += 1) {
      const b = butterflies[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (rand() < 0.04) {
        const a = rand() * Math.PI * 2;
        b.vx = Math.cos(a) * WANDER_SPEED;
        b.vz = Math.sin(a) * WANDER_SPEED;
        b.vy = (rand() - 0.5) * 0.5;
      }
      // Keep inside the inland grass band roughly +20..+180 X.
      if (b.x < scene.origin.x + 20) b.vx = Math.abs(b.vx);
      if (b.x > scene.origin.x + 180) b.vx = -Math.abs(b.vx);
      if (b.z < scene.origin.z - 220) b.vz = Math.abs(b.vz);
      if (b.z > scene.origin.z + 220) b.vz = -Math.abs(b.vz);
      if (b.y < HEIGHT_BAND.min) b.vy = Math.abs(b.vy);
      if (b.y > HEIGHT_BAND.max) b.vy = -Math.abs(b.vy);
    }
  });
  return (
    <>
      {COLORS.map((color, ci) => (
        <BatchSlice key={`${scene.id}-bf-${ci}`}
          butterflies={butterflies.filter((b) => b.colorIndex === ci)}
          color={color}
          daynessRef={daynessRef}
        />
      ))}
    </>
  );
}

function BatchSlice({
  butterflies, color, daynessRef,
}: {
  butterflies: Butterfly[];
  color: string;
  daynessRef: React.MutableRefObject<number>;
}) {
  const slicePositions = useMemo(() => new Float32Array(butterflies.length * 3), [butterflies.length]);
  const sliceOpacities = useMemo(() => new Float32Array(butterflies.length), [butterflies.length]);
  const geomRef = useRef<THREE.BufferGeometry>(null);
  // Render this colour's slice from the shared (parent-simulated) butterflies,
  // applying the real day/night fade + per-wing flap the parent used to compute
  // and throw away. Runs after the parent's sim useFrame (registration order).
  useFrame(() => {
    const dayness = daynessRef.current;
    for (let k = 0; k < butterflies.length; k += 1) {
      const b = butterflies[k];
      slicePositions[k * 3] = b.x;
      slicePositions[k * 3 + 1] = b.y;
      slicePositions[k * 3 + 2] = b.z;
      const flap = 0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 80 + b.flapPhase));
      sliceOpacities[k] = dayness * flap;
    }
    const g = geomRef.current;
    if (g) {
      g.attributes.position.needsUpdate = true;
      g.attributes.opacity.needsUpdate = true;
    }
  });
  return (
    <points frustumCulled={false} raycast={() => null}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[slicePositions, 3]} />
        <bufferAttribute attach="attributes-opacity" args={[sliceOpacities, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={{ uColor: { value: new THREE.Color(color) } }}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </points>
  );
}

function makeButterflies(scene: WorldArtScene): Butterfly[] {
  const rand = mulberry32(scene.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 8101));
  const out: Butterfly[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    const a0 = rand() * Math.PI * 2;
    out.push({
      x: scene.origin.x + 30 + rand() * 140,
      y: HEIGHT_BAND.min + rand() * (HEIGHT_BAND.max - HEIGHT_BAND.min),
      z: scene.origin.z - 200 + rand() * 400,
      vx: Math.cos(a0) * WANDER_SPEED,
      vy: (rand() - 0.5) * 0.5,
      vz: Math.sin(a0) * WANDER_SPEED,
      flapPhase: rand() * Math.PI * 2,
      colorIndex: i % COLORS.length,
    });
  }
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
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

const vertexShader = `
  attribute float opacity;
  varying float vOpacity;
  void main() {
    vOpacity = opacity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 9.0 * (24.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const fragmentShader = `
  varying float vOpacity;
  uniform vec3 uColor;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float dist = length(d);
    float soft = 1.0 - smoothstep(0.10, 0.50, dist);
    if (soft <= 0.0) discard;
    gl_FragColor = vec4(uColor, soft * vOpacity);
  }
`;
