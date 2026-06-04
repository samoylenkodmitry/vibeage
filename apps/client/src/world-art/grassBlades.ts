import * as THREE from 'three';

/**
 * Shared grass-blade geometry + wind material for the dense near-field grass
 * carpet (WorldGrassField). A small clustered tuft — a few tapered, slightly
 * curved blades fanned around the root — built once and instanced thousands of
 * times. Blades carry a root→tip brightness gradient in vertex colour
 * (multiplied by each clump's tint) and up-facing normals for soft, even
 * stylized lighting. Each blade quad is indexed both windings so both sides are
 * front faces (FrontSide material) with the up normals intact — DoubleSide
 * would flip backface normals into unlit black blades.
 */
function buildTuft(blades: number, segments: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let vbase = 0;
  for (let b = 0; b < blades; b += 1) {
    const ang = (b / blades) * Math.PI * 2 + b * 1.7;
    const dirX = Math.cos(ang), dirZ = Math.sin(ang);
    const perpX = -dirZ, perpZ = dirX;
    const height = 0.78 + (b % 4) * 0.12;
    const lean = 0.16 + (b % 3) * 0.07;
    const baseW = 0.06;
    for (let s = 0; s <= segments; s += 1) {
      const t = s / segments;
      const w = baseW * (1 - t);
      const y = height * t;
      const bend = lean * t * t;
      const cx = dirX * bend, cz = dirZ * bend;
      const shade = 0.4 + 0.6 * t; // dark root → bright tip
      pos.push(cx + perpX * w, y, cz + perpZ * w, cx - perpX * w, y, cz - perpZ * w);
      col.push(shade, shade, shade, shade, shade, shade);
      nor.push(0, 1, 0, 0, 1, 0);
    }
    for (let s = 0; s < segments; s += 1) {
      const a = vbase + s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); // front
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); // back (reversed winding)
    }
    vbase += (segments + 1) * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** A 4-blade mini-tuft (3 segments) — cheap enough to instance ~10k× as a carpet. */
export const GRASS_GEOMETRY = buildTuft(4, 3);

// One shared wind uniform set, advanced by WorldGrassField's frame clock, drives
// every chunk's tip sway (all chunks share GRASS_MATERIAL).
export const GRASS_WIND = { uTime: { value: 0 }, uAmp: { value: 0.14 }, uSpeed: { value: 1.6 } };

export const GRASS_MATERIAL = (() => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
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
         #ifdef USE_INSTANCING
         vec3 gOrigin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
         #else
         vec3 gOrigin = vec3(0.0);
         #endif
         float gPhase = gOrigin.x * 0.21 + gOrigin.z * 0.17;
         float gSway = sin(uTime * uSpeed + gPhase) + 0.4 * sin(uTime * uSpeed * 1.9 + gPhase * 0.5);
         transformed.x += gSway * uAmp * transformed.y;
         transformed.z += cos(uTime * uSpeed * 0.8 + gPhase) * uAmp * 0.5 * transformed.y;`,
      );
  };
  return m;
})();
