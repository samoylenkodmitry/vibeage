import { Suspense, memo, useMemo } from 'react';
import { useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3D } from '../../../packages/protocol/messages';
import { InstancedGltf } from './world-art/InstancedGltf';
import type { WorldArtQuality } from './world-art/quality';
import {
  scatterChunkFoliage, splitByParity, foliageChunkOf, visibleFoliageChunks, FOLIAGE_CHUNK_SIZE,
  BROADLEAF_GLB, CONIFER_GLB, TREE_GLB_ALT, ACCENT_GLB_SMALL, ACCENT_GLB_MEDIUM, TREE_WIND,
  type FoliageInstance,
} from './world-art/foliageScatter';

/**
 * Position-stable foliage, streamed on its OWN chunk grid (foliageScatter,
 * larger than the terrain chunk so the same draw budget reaches the fog band).
 * Each chunk's trees/rocks/grass are a pure function of its origin, built once
 * + memoised + React-keyed by origin — so stable chunks never re-render and
 * only frontier chunks mount/unmount as the player moves. The frontier sits
 * deep in scene fog (WorldEnvironment), so those mounts/unmounts are invisible.
 * This replaces the old FoliageField, whose quantised jumping window +
 * distance falloff re-shuffled the whole view whenever the player crossed a
 * cell line.
 */
const CHUNK = FOLIAGE_CHUNK_SIZE;

function foliageRadius(quality: WorldArtQuality): number {
  // Frontier MUST land in the fog band, else crossing a chunk line pops a
  // whole row of trees in plain view. Retina Macs report quality 'medium'
  // (devicePixelRatio > 1.5), so medium gets the same far frontier as high
  // (3 × 320 = 960 m, fogged). Low still reaches 640 m (2 × 320) — partly
  // fogged — rather than the old 1-ring 256 m that toggled in your face.
  return quality === 'low' ? 2 : 3;
}

export function WorldFoliage({ focus, quality }: { focus: Vec3D; quality: WorldArtQuality }) {
  const c = foliageChunkOf(focus.x, focus.z);
  const radius = foliageRadius(quality);
  const chunks = useMemo(() => visibleFoliageChunks(c.cx, c.cz, radius), [c.cx, c.cz, radius]);
  const grassOn = quality !== 'low';
  // One shared clock advances every grass chunk's tip sway (all chunks share the
  // grass material + wind uniform), so the meadow ripples together cheaply.
  useFrame((_, delta) => { GRASS_WIND.uTime.value += delta; });
  return (
    <group>
      {chunks.map((chunk) => (
        <FoliageChunk key={`${chunk.x}:${chunk.z}`} originX={chunk.x} originZ={chunk.z} grassOn={grassOn} />
      ))}
    </group>
  );
}

const FoliageChunk = memo(function FoliageChunk({ originX, originZ, grassOn }: { originX: number; originZ: number; grassOn: boolean }) {
  const { trees, conifers, accents, grass } = useMemo(
    () => scatterChunkFoliage(originX, originZ, CHUNK, grassOn),
    [originX, originZ, grassOn],
  );
  const t = useMemo(() => splitByParity(trees), [trees]);
  const co = useMemo(() => splitByParity(conifers), [conifers]);
  const ac = useMemo(() => splitByParity(accents), [accents]);
  return (
    <>
      <Suspense fallback={null}>
        {t.evenMatrices.length > 0 && <InstancedGltf src={BROADLEAF_GLB} matrices={t.evenMatrices} colors={t.evenColors} baseScale={1.4} wind={TREE_WIND} />}
        {t.oddMatrices.length > 0 && <InstancedGltf src={TREE_GLB_ALT} matrices={t.oddMatrices} colors={t.oddColors} baseScale={1.4} wind={TREE_WIND} />}
        {co.evenMatrices.length > 0 && <InstancedGltf src={CONIFER_GLB} matrices={co.evenMatrices} colors={co.evenColors} baseScale={1.6} wind={TREE_WIND} />}
        {co.oddMatrices.length > 0 && <InstancedGltf src={TREE_GLB_ALT} matrices={co.oddMatrices} colors={co.oddColors} baseScale={1.6} wind={TREE_WIND} />}
        {ac.evenMatrices.length > 0 && <InstancedGltf src={ACCENT_GLB_SMALL} matrices={ac.evenMatrices} colors={ac.evenColors} baseScale={0.8} />}
        {ac.oddMatrices.length > 0 && <InstancedGltf src={ACCENT_GLB_MEDIUM} matrices={ac.oddMatrices} colors={ac.oddColors} baseScale={0.6} />}
      </Suspense>
      {grassOn && grass.length > 0 && <GrassClumps instances={grass} />}
    </>
  );
});

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpRot = new THREE.Euler();
const tmpColor = new THREE.Color();

// Shared grass wind state: one uniform set, advanced by WorldFoliage's frame
// clock, drives every chunk's tip sway (they share GRASS_MATERIAL).
const GRASS_WIND = { uTime: { value: 0 }, uAmp: { value: 0.16 }, uSpeed: { value: 1.5 } };

/** A clustered grass tuft: several tapered, slightly-curved blades fanned around
 *  the root. Built once and instanced per clump. Blades carry a root→tip
 *  brightness gradient in vertex color (multiplied by each clump's instance
 *  tint); normals point up for soft, even stylized lighting (no dark edges). */
function buildGrassTuftGeometry(): THREE.BufferGeometry {
  const BLADES = 5;
  const SEG = 4;
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let vbase = 0;
  for (let b = 0; b < BLADES; b += 1) {
    const ang = (b / BLADES) * Math.PI * 2 + b * 1.7;
    const dirX = Math.cos(ang), dirZ = Math.sin(ang);
    const perpX = -dirZ, perpZ = dirX;
    const height = 0.62 + (b % 4) * 0.1;
    const lean = 0.14 + (b % 3) * 0.06;
    const baseW = 0.05;
    for (let s = 0; s <= SEG; s += 1) {
      const t = s / SEG;
      const w = baseW * (1 - t);
      const y = height * t;
      const bend = lean * t * t;
      const cx = dirX * bend, cz = dirZ * bend;
      const shade = 0.45 + 0.55 * t; // darker at the root, bright at the tip
      pos.push(cx + perpX * w, y, cz + perpZ * w, cx - perpX * w, y, cz - perpZ * w);
      col.push(shade, shade, shade, shade, shade, shade);
      nor.push(0, 1, 0, 0, 1, 0);
    }
    for (let s = 0; s < SEG; s += 1) {
      const a = vbase + s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    vbase += (SEG + 1) * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

const GRASS_GEOMETRY = buildGrassTuftGeometry();

const GRASS_MATERIAL = (() => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = GRASS_WIND.uTime;
    shader.uniforms.uAmp = GRASS_WIND.uAmp;
    shader.uniforms.uSpeed = GRASS_WIND.uSpeed;
    shader.vertexShader = 'uniform float uTime;\nuniform float uAmp;\nuniform float uSpeed;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         // Per-clump phase from its world origin so blades don't sway in lockstep;
         // displacement scales with local height so roots stay planted, tips bend.
         vec3 gOrigin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
         float gPhase = gOrigin.x * 0.21 + gOrigin.z * 0.17;
         float gSway = sin(uTime * uSpeed + gPhase) + 0.4 * sin(uTime * uSpeed * 1.9 + gPhase * 0.5);
         transformed.x += gSway * uAmp * transformed.y;
         transformed.z += cos(uTime * uSpeed * 0.8 + gPhase) * uAmp * 0.5 * transformed.y;`,
      );
  };
  return m;
})();

/** Procedural grass tufts for one chunk (one instanced draw, shared geo+material). */
function GrassClumps({ instances }: { instances: FoliageInstance[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    instances.forEach((inst, i) => {
      tmpPos.set(inst.x, inst.y, inst.z);
      tmpRot.set(0, inst.rotation, 0);
      tmpQuat.setFromEuler(tmpRot);
      tmpScale.set(inst.scale, inst.scale * 1.15, inst.scale);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i, tmpMatrix);
      mesh.setColorAt(i, tmpColor.set(inst.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = instances.length;
    // Same origin-anchored-bounding-sphere trap as InstancedGltf: recompute
    // over the real instances or the whole grass mesh is frustum-culled the
    // instant world-origin leaves the view.
    mesh.computeBoundingSphere();
  }, [instances]);
  return (
    <instancedMesh ref={ref} args={[GRASS_GEOMETRY, GRASS_MATERIAL, Math.max(1, instances.length)]} receiveShadow />
  );
}
