import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3D } from '../../../packages/protocol/messages';

/**
 * A jagged mountain-range silhouette on the far horizon that FOLLOWS the player
 * — the whole group re-centres on `focus` every frame (like the clouds and sun
 * in WorldEnvironment), so every location gets a mountainous backdrop and the
 * ring never mounts/unmounts at a scene boundary.
 *
 * Two concentric ridgeline rings (not the old ice-cream cones): each is a
 * continuous curtain whose top edge is a sum of periodic sines, so it reads as
 * a real range of overlapping peaks rather than discrete triangles. The near
 * ring is darker + taller; the far ring is lighter and lower so it recedes into
 * the haze (atmospheric perspective). A bottom→top vertex gradient and the
 * scene fog fade the peaks into the sky. Unlit (MeshBasic) on purpose — distant
 * fogged mountains are a flat silhouette, not a lit surface; fog (driven by the
 * day phase) does the tinting. One draw per ring, geometry built once.
 */
const BASE_Y = -10;

type RingSpec = {
  radius: number; minH: number; maxH: number; seed: number;
  colorBottom: string; colorTop: string;
};

const RINGS: RingSpec[] = [
  // Far range first (drawn behind), hazier + lower.
  { radius: 920, minH: 70, maxH: 170, seed: 1337, colorBottom: '#3d4d61', colorTop: '#56697f' },
  // Near range, darker + taller, partially occludes the far one.
  { radius: 720, minH: 110, maxH: 280, seed: 7919, colorBottom: '#28333f', colorTop: '#3a4a5d' },
];

/** A closed cylindrical curtain whose top edge is a periodic ridgeline. */
function buildRange(spec: RingSpec): THREE.BufferGeometry {
  const SEG = 200;
  const rand = mulberry32(spec.seed);
  const p1 = rand() * 6.28, p2 = rand() * 6.28, p3 = rand() * 6.28, p4 = rand() * 6.28;
  const cBot = new THREE.Color(spec.colorBottom);
  const cTop = new THREE.Color(spec.colorTop);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= SEG; i += 1) {
    const a = (i / SEG) * Math.PI * 2;
    // Periodic (integer harmonics) so the ridge wraps seamlessly at 2π.
    const n = 0.5
      + 0.30 * Math.sin(a * 3 + p1)
      + 0.18 * Math.sin(a * 7 + p2)
      + 0.12 * Math.sin(a * 13 + p3)
      + 0.07 * Math.sin(a * 23 + p4);
    const h = BASE_Y + spec.minH + (spec.maxH - spec.minH) * Math.min(1, Math.max(0, n));
    const x = Math.cos(a) * spec.radius, z = Math.sin(a) * spec.radius;
    pos.push(x, BASE_Y, z, x, h, z);
    col.push(cBot.r, cBot.g, cBot.b, cTop.r, cTop.g, cTop.b);
  }
  for (let i = 0; i < SEG; i += 1) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export function WorldHorizonMountains({ focus }: { focus: Vec3D }) {
  const geometries = useMemo(() => RINGS.map(buildRange), []);
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const g = groupRef.current;
    if (g) g.position.set(focus.x, 0, focus.z);
  });

  return (
    <group ref={groupRef} raycast={() => null}>
      {geometries.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          <meshBasicMaterial vertexColors side={THREE.DoubleSide} fog />
        </mesh>
      ))}
    </group>
  );
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
