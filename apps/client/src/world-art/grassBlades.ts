import * as THREE from 'three';

/**
 * Shared grass-blade geometry + wind material for the dense near-field grass
 * carpet (WorldGrassField).
 *
 * A clump is a small fan of CURVED blades. Each blade arcs forward as it rises
 * (real grass droops, it isn't a straight spike), tapers to a point, and carries
 * a root→tip vertex gradient that also warms toward the tip (yellow-green) — so
 * the carpet reads with depth and life rather than as a flat green sheet. Normals
 * lean outward + up per blade, so blades catch the sun directionally instead of
 * all looking identically lit. DoubleSide keeps it cheap (no baked back-faces);
 * undersides fall back to the hemisphere light's ground tone, which is fine for
 * grass.
 *
 * The material patches MeshStandard's vertex shader (keeping PBR + fog + shadows)
 * with (a) per-clump tip-sway wind and (b) a distance fade: blades shrink into
 * the ground toward the field edge, so there's no hard ring and frontier chunks
 * grow in smoothly instead of popping. Both read shared uniforms advanced by
 * WorldGrassField.
 */
function buildTuft(blades: number, segments: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let vbase = 0;
  for (let b = 0; b < blades; b += 1) {
    const ang = (b / blades) * Math.PI * 2 + b * 1.3;
    const dirX = Math.cos(ang), dirZ = Math.sin(ang);
    const perpX = -dirZ, perpZ = dirX;
    const height = 0.82 + (b % 4) * 0.13;
    const arc = 0.22 + (b % 3) * 0.08;   // how far the blade droops forward
    const baseW = 0.055;
    // Outward+up normal so blades shade directionally yet still catch the sky.
    const nl = Math.hypot(dirX * 0.5, 1, dirZ * 0.5);
    const nx = (dirX * 0.5) / nl, ny = 1 / nl, nz = (dirZ * 0.5) / nl;
    for (let s = 0; s <= segments; s += 1) {
      const t = s / segments;
      const w = (s === segments) ? 0 : baseW * (1 - t * t * 0.85); // taper to a point
      const y = height * t;
      const bend = arc * t * t;            // quadratic forward droop
      const cx = dirX * bend, cz = dirZ * bend;
      const shade = 0.34 + 0.66 * t;       // dark root → bright tip
      const warm = 1 - 0.32 * t;           // tip leans warm (less blue) → yellow-green
      pos.push(cx + perpX * w, y, cz + perpZ * w, cx - perpX * w, y, cz - perpZ * w);
      col.push(shade, shade, shade * warm, shade, shade, shade * warm);
      nor.push(nx, ny, nz, nx, ny, nz);
    }
    for (let s = 0; s < segments; s += 1) {
      const a = vbase + s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
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

/** A 5-blade curved tuft (5 segments) — instanced ~25k× as a carpet. */
export const GRASS_GEOMETRY = buildTuft(5, 5);

// Shared uniforms, advanced by WorldGrassField's frame clock. uPlayer + the fade
// band drive the smooth edge falloff; the wind set drives tip sway.
export const GRASS_WIND = {
  uTime: { value: 0 },
  uAmp: { value: 0.13 },
  uSpeed: { value: 1.6 },
  uPlayer: { value: new THREE.Vector2() },
  uFadeNear: { value: 30 },
  uFadeFar: { value: 56 },
};

export const GRASS_MATERIAL = (() => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GRASS_WIND);
    shader.vertexShader = `
      uniform float uTime; uniform float uAmp; uniform float uSpeed;
      uniform vec2 uPlayer; uniform float uFadeNear; uniform float uFadeFar;
    ` + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
       vec3 gOrigin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
       #else
       vec3 gOrigin = vec3(0.0);
       #endif
       // Shrink the whole blade to a point at its root toward the field edge — no
       // hard ring, and frontier chunks grow in smoothly instead of popping.
       // (Scaling y alone would flatten blades into 2D shards on the ground.)
       float gFade = 1.0 - smoothstep(uFadeNear, uFadeFar, distance(gOrigin.xz, uPlayer));
       transformed *= gFade;
       // Per-clump phase so blades don't sway in lockstep; tips bend, roots hold.
       float gPhase = gOrigin.x * 0.21 + gOrigin.z * 0.17;
       float gSway = sin(uTime * uSpeed + gPhase) + 0.4 * sin(uTime * uSpeed * 1.9 + gPhase * 0.5);
       transformed.x += gSway * uAmp * transformed.y;
       transformed.z += cos(uTime * uSpeed * 0.8 + gPhase) * uAmp * 0.5 * transformed.y;`,
    );
  };
  return m;
})();
