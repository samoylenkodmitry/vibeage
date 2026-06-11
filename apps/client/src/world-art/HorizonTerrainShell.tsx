import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleTerrain } from '../../../../packages/content/terrain';
import { heightTint, normalizeTintLuminance } from '../WorldGround';

/**
 * Far-horizon terrain — a single coarse mesh carrying the world's relief out
 * to ±4 km so the mountain ridges and valleys read as a real vista instead of
 * ending at the detailed-chunk frontier (1 km). One draw call, ~9.4 k verts.
 *
 * Position-stable: the shell re-anchors in SNAP-sized jumps, and SNAP is an
 * exact multiple of the vertex spacing (512 = 6 × 85.33 m), so every vertex
 * always lands on the same fixed world lattice — identical height/colour for
 * a given spot, no swimming as the player moves. Heights/colours come from
 * the same sampleTerrain the near chunks use; vertices sit Y_OFFSET below
 * true height so the detailed chunks always win the depth test where they
 * exist, and the shell becomes the terrain beyond them (2.5 m is invisible
 * at 1 km+).
 *
 * Rebuilds are incremental (ROWS_PER_FRAME rows of sampleTerrain per frame,
 * swap on completion) so re-anchoring never hitches a frame — same pattern
 * as GrassDensityField. raycast disabled: click-to-move only targets the
 * real chunks, exactly as before.
 */
const EXTENT = 4096;        // shell covers ±4096 m around the anchor
const SEG = 96;             // 96×96 quads → 85.33 m per quad
const SNAP = 512;           // re-anchor step; MUST be a multiple of 2*EXTENT/SEG
const ROWS_PER_FRAME = 8;
const Y_OFFSET = -2.5;      // sit under the detailed chunks where they overlap

const VERTS = SEG + 1;

export function HorizonTerrainShell({ focus }: { focus: { x: number; z: number } }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(VERTS * VERTS * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(VERTS * VERTS * 3), 3));
    const indices: number[] = [];
    for (let z = 0; z < SEG; z += 1) {
      for (let x = 0; x < SEG; x += 1) {
        const tl = z * VERTS + x;
        indices.push(tl, tl + VERTS, tl + 1, tl + 1, tl + VERTS, tl + VERTS + 1);
      }
    }
    g.setIndex(indices);
    return g;
  }, []);

  const state = useRef({
    anchorX: NaN,
    anchorZ: NaN,
    building: false,
    buildRow: 0,
    pendingX: 0,
    pendingZ: 0,
    // staging buffers so an in-progress rebuild never shows half-moved verts
    positions: new Float32Array(VERTS * VERTS * 3),
    colors: new Float32Array(VERTS * VERTS * 3),
  });

  useFrame(() => {
    const s = state.current;
    const snapX = Math.round(focus.x / SNAP) * SNAP;
    const snapZ = Math.round(focus.z / SNAP) * SNAP;

    if (Number.isNaN(s.anchorX)) {
      bakeRows(s.positions, s.colors, snapX, snapZ, 0, VERTS);
      commit(geometry, s.positions, s.colors);
      s.anchorX = snapX;
      s.anchorZ = snapZ;
      return;
    }
    if (!s.building && (snapX !== s.anchorX || snapZ !== s.anchorZ)) {
      s.building = true;
      s.buildRow = 0;
      s.pendingX = snapX;
      s.pendingZ = snapZ;
    }
    if (s.building) {
      const end = Math.min(VERTS, s.buildRow + ROWS_PER_FRAME);
      bakeRows(s.positions, s.colors, s.pendingX, s.pendingZ, s.buildRow, end);
      s.buildRow = end;
      if (s.buildRow >= VERTS) {
        s.building = false;
        commit(geometry, s.positions, s.colors);
        s.anchorX = s.pendingX;
        s.anchorZ = s.pendingZ;
      }
    }
  });

  return (
    <mesh
      geometry={geometry}
      frustumCulled={false}
      receiveShadow={false}
      raycast={() => null}
    >
      <meshStandardMaterial vertexColors roughness={0.98} metalness={0.02} />
    </mesh>
  );
}

const BAKE_COLOR = new THREE.Color();
const BAKE_ACCENT = new THREE.Color();

function bakeRows(positions: Float32Array, colors: Float32Array, anchorX: number, anchorZ: number, z0: number, z1: number): void {
  const step = (2 * EXTENT) / SEG;
  for (let z = z0; z < z1; z += 1) {
    const wz = anchorZ - EXTENT + z * step;
    for (let x = 0; x < VERTS; x += 1) {
      const wx = anchorX - EXTENT + x * step;
      const terrain = sampleTerrain(wx, wz);
      const base = (z * VERTS + x) * 3;
      positions[base] = wx;
      positions[base + 1] = terrain.height + Y_OFFSET;
      positions[base + 2] = wz;
      BAKE_COLOR.set(terrain.groundColor).lerp(BAKE_ACCENT.set(terrain.accentColor), heightTint(terrain.height));
      // Match the near chunks' albedo model: normalized tint × a constant
      // standing in for the ground texture's mean colour (the shell has no
      // map). Keeps the 1 km seam consistent now that near-terrain tints are
      // luminance-normalized.
      normalizeTintLuminance(BAKE_COLOR);
      colors[base] = BAKE_COLOR.r * 0.42;
      colors[base + 1] = BAKE_COLOR.g * 0.44;
      colors[base + 2] = BAKE_COLOR.b * 0.38;
    }
  }
}

function commit(geometry: THREE.BufferGeometry, positions: Float32Array, colors: Float32Array): void {
  (geometry.getAttribute('position') as THREE.BufferAttribute).copyArray(positions).needsUpdate = true;
  (geometry.getAttribute('color') as THREE.BufferAttribute).copyArray(colors).needsUpdate = true;
  geometry.computeVertexNormals();
}
