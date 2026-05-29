import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3D } from '../../../packages/protocol/messages';

/**
 * A low-poly mountain silhouette ring on the far horizon that FOLLOWS the
 * player — the whole group re-centres on `focus` every frame (like the clouds
 * and sun in WorldEnvironment), so every location gets a mountainous backdrop
 * instead of a flat void edge, and the ring never mounts/unmounts at a scene
 * boundary (the old CozyDistantMountains was anchored to the cozy-coast origin,
 * so it was only a proper ring near spawn).
 *
 * Sits just past the foliage frontier (~960 m) and inside the scene fog band,
 * so it reads as a hazy distant range. fog stays enabled (default) on purpose.
 * One InstancedMesh (1 draw) built once — instances are RELATIVE to the group,
 * so computeBoundingSphere gives a correct local sphere that follows focus via
 * the group transform (no origin-anchored frustum-cull trap), and re-rendering
 * on each focus tick reconciles nothing.
 */
const RING_RADIUS = 780;
const BASE_Y = -8;
const COUNT = 20;
const COLOR = '#36475a';

type Mountain = { x: number; z: number; height: number; baseRadius: number; rotationY: number };

function makeRing(): Mountain[] {
  const rand = mulberry32(7919);
  const out: Mountain[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    // Even 360° spread + jitter so the ring surrounds the player from every
    // angle without reading as a regular comb.
    const angle = (i / COUNT) * Math.PI * 2 + (rand() - 0.5) * 0.14;
    const radius = RING_RADIUS + (rand() - 0.5) * 130;
    out.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      height: 150 + rand() * 120,
      baseRadius: 70 + rand() * 55,
      rotationY: rand() * Math.PI * 2,
    });
  }
  return out;
}

export function WorldHorizonMountains({ focus }: { focus: Vec3D }) {
  const mountains = useMemo(makeRing, []);
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useFrame(() => {
    const g = groupRef.current;
    if (g) g.position.set(focus.x, 0, focus.z);
  });

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Euler();
    const matrix = new THREE.Matrix4();
    mountains.forEach((m, i) => {
      // Unit cone scaled per instance: base radius on XZ, height on Y.
      position.set(m.x, BASE_Y + m.height / 2, m.z);
      rotation.set(0, m.rotationY, 0);
      quaternion.setFromEuler(rotation);
      scale.set(m.baseRadius, m.height, m.baseRadius);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = mountains.length;
    mesh.computeBoundingSphere();
  }, [mountains]);

  return (
    <group ref={groupRef} raycast={() => null}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]} castShadow={false} receiveShadow={false}>
        <coneGeometry args={[1, 1, 6, 1]} />
        <meshStandardMaterial color={COLOR} roughness={1} metalness={0} />
      </instancedMesh>
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
