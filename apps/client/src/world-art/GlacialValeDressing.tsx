import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLACIAL_VALE, VALE_TARN_WATER_Y, getTerrainHeight } from '../../../../packages/content/terrain';
import { seededRandom } from './foliageScatter';
import { GlacialValeTerrain } from './GlacialValeTerrain';

/**
 * Glacial Vale dressing (after deedy/glacial-valley): the turquoise tarn,
 * the pebble shore, and falling snow. The terrain bones live in terrain.ts
 * (glacialValeHeight); this renders only when the player is near the vale.
 *
 * Tricks borrowed from the reference:
 *  - rock-flour turquoise: deep teal → milky cyan, far stronger than the
 *    plain lakes, plus drifting sun glitter.
 *  - pebbles: squashed icosahedrons, size ~ pow(rng, 2.2) (many small, few
 *    large), scattered where the shore band crosses the waterline.
 *  - snowfall: slow drifting flakes with per-flake sway, wrapped vertically.
 */
const MOUNT_DISTANCE = 1_600;
const PEBBLE_COUNT = 1_200;
const SNOW_COUNT = 340;
const SNOW_TOP = 60;

export function GlacialValeDressing({ focus }: { focus: { x: number; z: number } }) {
  const inRange = Math.hypot(focus.x - GLACIAL_VALE.x, focus.z - GLACIAL_VALE.z) < MOUNT_DISTANCE;
  if (!inRange) return null;
  return <ValeInner />;
}

function ValeInner() {
  return (
    <group>
      {/* per-pixel ground/water/boulders ported from the reference */}
      <GlacialValeTerrain />
      <PebbleShore />
      <Snowfall />
    </group>
  );
}

/** Squashed-icosahedron pebbles where the shore band crosses the waterline. */
function PebbleShore() {
  const built = useMemo(() => {
    const random = seededRandom(0x9eb8, 0x1e5);
    const matrices: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const euler = new THREE.Euler();
    let tries = 0;
    while (matrices.length < PEBBLE_COUNT && tries < PEBBLE_COUNT * 12) {
      tries += 1;
      // scatter in the tarn's local frame, filter by the shore height band
      const u = (random() - 0.5) * 560;
      const v = (random() - 0.5) * 300;
      const s = 0.06 + Math.pow(random(), 2.2) * 0.3;
      const yaw = random() * Math.PI * 2;
      const shade = 0.32 + random() * 0.3;
      const x = GLACIAL_VALE.x + u * GLACIAL_VALE.cos - v * GLACIAL_VALE.sin;
      const z = GLACIAL_VALE.z + u * GLACIAL_VALE.sin + v * GLACIAL_VALE.cos;
      const h = getTerrainHeight(x, z);
      if (h < VALE_TARN_WATER_Y - 0.8 || h > VALE_TARN_WATER_Y + 2.6) continue;
      pos.set(x, h + s * 0.3, z);
      quat.setFromEuler(euler.set(0, yaw, 0));
      scl.set(s, s * 0.55, s);
      matrices.push(new THREE.Matrix4().compose(pos, quat, scl));
      colors.push(new THREE.Color(shade * 0.92, shade * 0.96, shade * 1.05));
    }
    return { matrices, colors };
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < built.matrices.length; i += 1) {
      mesh.setMatrixAt(i, built.matrices[i]);
      mesh.setColorAt(i, built.colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = built.matrices.length;
    mesh.computeBoundingSphere();
  }, [built]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, built.matrices.length]} raycast={() => null} receiveShadow>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial roughness={0.78} metalness={0.04} />
    </instancedMesh>
  );
}

/** Slow drifting snowfall over the valley floor. */
function Snowfall() {
  const sim = useMemo(() => {
    const random = seededRandom(0x50, 0xfa11);
    const flakes = Array.from({ length: SNOW_COUNT }, () => ({
      u: (random() - 0.5) * 760,
      v: (random() - 0.5) * 480,
      y: random() * SNOW_TOP,
      speed: 0.9 + random() * 1.3,
      phase: random() * Math.PI * 2,
    }));
    return { flakes, positions: new Float32Array(SNOW_COUNT * 3) };
  }, []);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = clock.elapsedTime;
    for (let i = 0; i < sim.flakes.length; i += 1) {
      const f = sim.flakes[i];
      f.y -= f.speed * dt;
      if (f.y < 0) f.y += SNOW_TOP;
      const sway = Math.sin(t * 0.7 + f.phase) * 2.2;
      const x = GLACIAL_VALE.x + (f.u + sway) * GLACIAL_VALE.cos - f.v * GLACIAL_VALE.sin;
      const z = GLACIAL_VALE.z + (f.u + sway) * GLACIAL_VALE.sin + f.v * GLACIAL_VALE.cos;
      sim.positions[i * 3] = x;
      // Absolute world Y: the valley floor sits near 0, so flakes span the
      // 0..SNOW_TOP air column above it (walls are dressed by the snowline).
      sim.positions[i * 3 + 1] = f.y;
      sim.positions[i * 3 + 2] = z;
    }
    const g = geometryRef.current;
    if (g) g.attributes.position.needsUpdate = true;
  });
  return (
    <points frustumCulled={false} raycast={() => null}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[sim.positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#f4f8ff" size={0.22} sizeAttenuation transparent opacity={0.85} depthWrite={false} />
    </points>
  );
}

