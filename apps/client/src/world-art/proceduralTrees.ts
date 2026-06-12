import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seededRandom } from './foliageScatter';

/**
 * Procedural painterly trees — the forest's silhouette is the world's
 * silhouette, and the old pine GLBs read as toy lollipops (two spheres on a
 * stick) in every screenshot. These are built once at module init: a flared
 * trunk plus an irregular cluster of squashed flat-shaded icosahedron blobs
 * (broadleaf) or jittered stacked cones (conifer) — the same painterly crown
 * language as the landmark trees (#881), which always read well.
 *
 * Each tree is a Group of exactly two meshes (trunk, canopy) so InstancedModel
 * renders a whole forest variant as 2 instanced draws. Canopy vertex COLORS
 * carry per-blob light/dark variation (multiplied by the per-instance biome
 * tint); the canopy material stays white so the tint owns the hue — never
 * multiply two dark colour sources (the #875 albedo rule).
 */
const TRUNK_MATERIAL = new THREE.MeshStandardMaterial({ color: '#7d5c3c', roughness: 0.95, flatShading: true });
const CANOPY_MATERIAL = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88, flatShading: true, vertexColors: true });

/** Paint one flat shade over a geometry's vertices (painterly blob depth). */
function bakeShade(geometry: THREE.BufferGeometry, shade: number): THREE.BufferGeometry {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  colors.fill(shade);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function buildBroadleaf(seed: number): THREE.Group {
  const random = seededRandom(seed, seed ^ 0x9e3779b9);
  const group = new THREE.Group();

  const trunkHeight = 2.4 + random() * 0.5;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.3, trunkHeight, 7),
    TRUNK_MATERIAL,
  );
  trunk.position.y = trunkHeight / 2;
  group.add(trunk);

  // Crown: one tall central blob + a ring of smaller ones at varied heights.
  const blobs: THREE.BufferGeometry[] = [];
  const crownBase = trunkHeight * 0.92;
  const blobCount = 5 + Math.floor(random() * 2);
  for (let i = 0; i < blobCount; i += 1) {
    const central = i === 0;
    const radius = central ? 1.35 + random() * 0.25 : 0.75 + random() * 0.5;
    const angle = (i / blobCount) * Math.PI * 2 + random() * 0.9;
    const ring = central ? 0 : 0.7 + random() * 0.55;
    const blob = new THREE.IcosahedronGeometry(radius, 1);
    blob.scale(1, 0.62 + random() * 0.2, 1);
    blob.translate(
      Math.cos(angle) * ring,
      crownBase + (central ? 1.15 : 0.35 + random() * 1.0),
      Math.sin(angle) * ring,
    );
    blobs.push(bakeShade(blob, 0.8 + random() * 0.38));
  }
  const canopy = new THREE.Mesh(mergeGeometries(blobs) ?? blobs[0], CANOPY_MATERIAL);
  group.add(canopy);
  return group;
}

function buildConifer(seed: number): THREE.Group {
  const random = seededRandom(seed ^ 0x51f15eed, seed);
  const group = new THREE.Group();

  const trunkHeight = 1.5 + random() * 0.4;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.24, trunkHeight + 0.6, 7),
    TRUNK_MATERIAL,
  );
  trunk.position.y = (trunkHeight + 0.6) / 2;
  group.add(trunk);

  // Spire of overlapping cones, each with silhouette jitter so the outline
  // is irregular instead of a perfect dunce cap.
  const tiers: THREE.BufferGeometry[] = [];
  const tierCount = 4;
  const spireHeight = 3.4 + random() * 0.9;
  for (let i = 0; i < tierCount; i += 1) {
    const t = i / (tierCount - 1);
    const radius = (1.45 - t * 0.95) * (0.88 + random() * 0.24);
    const height = spireHeight * 0.42;
    const cone = new THREE.ConeGeometry(radius, height, 7);
    cone.translate(
      (random() - 0.5) * 0.26,
      trunkHeight + t * spireHeight * 0.78 + height * 0.3,
      (random() - 0.5) * 0.26,
    );
    tiers.push(bakeShade(cone, 0.78 + random() * 0.4 - t * 0.08));
  }
  const canopy = new THREE.Mesh(mergeGeometries(tiers) ?? tiers[0], CANOPY_MATERIAL);
  group.add(canopy);
  return group;
}

// Two seeded variants per family — silhouette variety on top of the
// per-instance scale/rotation/tint variance. Module singletons: built once,
// shared by every chunk's InstancedModel.
export const BROADLEAF_TREE_A = buildBroadleaf(101);
export const BROADLEAF_TREE_B = buildBroadleaf(202);
export const CONIFER_TREE_A = buildConifer(303);
export const CONIFER_TREE_B = buildConifer(404);
