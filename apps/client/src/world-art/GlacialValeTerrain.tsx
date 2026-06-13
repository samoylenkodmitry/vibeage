import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import * as THREE from 'three';
import { GLACIAL_VALE, VALE_TARN_WATER_Y, getTerrainHeight } from '../../../../packages/content/terrain';
import { computeDayPhase } from '../timeOfDay';
import { seededRandom } from './foliageScatter';
import {
  REF_TERRAIN_VERT, REF_TERRAIN_FRAG,
  REF_WATER_VERT, REF_WATER_FRAG, REF_WATER_FRAG_HD,
  REF_GRASS_VERT, REF_GRASS_FRAG,
  REF_ROCK_VERT, REF_ROCK_FRAG,
} from './glacialRefShaders';

/**
 * VALE_HD: render the vale with deedy/glacial-valley's actual renderer — a
 * screen-space refraction pass for the water (samples the lit bed → milky
 * turquoise) under his HDR palette driven by our day phase, resolved by an ACES
 * post (ScenePostFX swaps NEUTRAL→ACES near the vale). The refraction renders
 * the vale (a half-res pass via a camera layer, water excluded), so the cost is
 * a second pass over just the vale geometry. Only runs where the vale mounts
 * (worldArtQuality !== 'low'), i.e. never on phones. (A per-user graphics
 * setting to toggle it is the planned follow-up.)
 */
export const VALE_HD = true;
const VALE_BED_LAYER = 11; // ground + rocks render here too, for the refraction pass

/**
 * The Glacial Vale, running deedy/glacial-valley's actual pipeline (the
 * user's direction: copy that repo). Same architecture as their main.js:
 * a height grid baked at load → RGBA DataTexture (R height, G/B sun
 * visibility ray-marched with THEIR bakeShadows for two azimuths, blended
 * by uVisW like their day cycle), a dense mesh displaced from the same
 * grid, and their terrain/water/grass/rock shaders sampling the texture
 * per pixel (the soft kilometre mountain shadows included). The bake runs
 * in row chunks off the frame loop; the vale pops in once ready (~1-2 s).
 * Their palette uniforms are driven from OUR day phase, with sun intensity
 * rescaled for the NEUTRAL tonemap (theirs assumed ACES at 10.5).
 */
const GRID_RES = 768;            // bake resolution over the vale (≈1.7 m/texel)
export const GRID_HALF = 660;
const MESH_SEG = 360;            // mesh density (≈3.7 m; per-pixel shading on top)
const GRASS_COUNT = 120_000;     // dense bank carpet (their 85k was a r=95 disc)
export const PEBBLE_COUNT = 6_000;
export const BOULDER_COUNT = 64;
export const WATER_Y = VALE_TARN_WATER_Y; // 0 — their WATER_Y

export type Bake = { tex: THREE.DataTexture; grid: Float32Array };

/** Their bakeShadows, verbatim (sun-visibility ray-march over the grid). */
function bakeShadows(h: Float32Array, res: number, step: number, sunDir: THREE.Vector3): Float32Array {
  const vis = new Float32Array(res * res).fill(1);
  const horiz = Math.hypot(sunDir.x, sunDir.z);
  const dirx = sunDir.x / horiz;
  const dirz = sunDir.z / horiz;
  const tanEl = sunDir.y / horiz;
  const maxD = GRID_HALF * 2;
  const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  for (let j = 0; j < res; j += 1) {
    for (let i = 0; i < res; i += 1) {
      const h0 = h[j * res + i] + 0.6;
      let v = 1;
      let d = 4;
      let stp = Math.max(step * 0.8, 3);
      for (let k = 0; k < 44; k += 1) {
        d += stp; stp *= 1.10;
        if (d > maxD) break;
        const sx = i + (dirx * d) / step;
        const sz = j + (dirz * d) / step;
        if (sx < 0 || sz < 0 || sx >= res - 1 || sz >= res - 1) break;
        const ix = sx | 0; const iz = sz | 0;
        const tx = sx - ix; const tz = sz - iz;
        const i0 = iz * res + ix;
        const ht = lerp(lerp(h[i0], h[i0 + 1], tx), lerp(h[i0 + res], h[i0 + res + 1], tx), tz);
        const ray = h0 + tanEl * d;
        v = Math.min(v, clamp(0.5 + (ray - ht) / (d * 0.035), 0, 1));
        if (v <= 0) break;
      }
      vis[j * res + i] = v;
    }
  }
  return vis;
}

/** Async (row-chunked) bake of the height grid + two shadow maps. */
export function useValeBake(): Bake | null {
  const [bake, setBake] = useState<Bake | null>(null);
  useEffect(() => {
    let cancelled = false;
    const res = GRID_RES;
    const step = (2 * GRID_HALF) / (res - 1);
    const h = new Float32Array(res * res);
    let row = 0;
    const fillRows = () => {
      if (cancelled) return;
      const until = Math.min(res, row + 24);
      for (; row < until; row += 1) {
        const z = GLACIAL_VALE.z - GRID_HALF + row * step;
        for (let i = 0; i < res; i += 1) {
          h[row * res + i] = getTerrainHeight(GLACIAL_VALE.x - GRID_HALF + i * step, z);
        }
      }
      if (row < res) {
        setTimeout(fillRows, 0);
        return;
      }
      // morning / evening sun azimuths — their two baked directions
      setTimeout(() => {
        if (cancelled) return;
        const visM = bakeShadows(h, res, step, new THREE.Vector3(0.8, 0.42, 0.3).normalize());
        setTimeout(() => {
          if (cancelled) return;
          const visE = bakeShadows(h, res, step, new THREE.Vector3(-0.8, 0.42, -0.2).normalize());
          // HALF-float, not float: the water/sunVis shaders sample this with
          // LINEAR filtering, and 32-bit-float linear filtering needs
          // OES_texture_float_linear (absent on many GPUs) → garbage samples,
          // which is why the river read as fixed garbage puddles regardless of
          // the terrain. RGBA16F linear filtering is core WebGL2; heights
          // (≤~250) sit well inside half-float range/precision.
          const data = new Uint16Array(res * res * 4);
          const toHalf = THREE.DataUtils.toHalfFloat;
          const oneHalf = toHalf(1);
          for (let i = 0; i < res * res; i += 1) {
            data[i * 4] = toHalf(h[i]);
            data[i * 4 + 1] = toHalf(visM[i]);
            data[i * 4 + 2] = toHalf(visE[i]);
            data[i * 4 + 3] = oneHalf;
          }
          const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.HalfFloatType);
          tex.magFilter = THREE.LinearFilter;
          tex.minFilter = THREE.LinearFilter;
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.needsUpdate = true;
          if (!cancelled) setBake({ tex, grid: h });
          else tex.dispose(); // unmount raced the last bake step
        }, 0);
      }, 0);
    };
    fillRows();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => () => { bake?.tex.dispose(); }, [bake]);
  return bake;
}

export function refUniforms(tex: THREE.DataTexture) {
  return {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Vector3(2.4, 1.9, 1.4) },
    uSkyZenith: { value: new THREE.Vector3(0.21, 0.36, 0.65) },
    uHorizonCold: { value: new THREE.Vector3(0.46, 0.55, 0.72) },
    uHorizonWarm: { value: new THREE.Vector3(1.16, 0.55, 0.22) },
    uGroundBounce: { value: new THREE.Vector3(0.10, 0.085, 0.07) },
    uMapFine: { value: tex },
    uRegFine: { value: new THREE.Vector3(GLACIAL_VALE.x, GLACIAL_VALE.z, GRID_HALF) },
    uWaterY: { value: WATER_Y },
    uWindDir: { value: new THREE.Vector2(0.83, 0.55) },
    uVisW: { value: new THREE.Vector2(1, 0) },
    uGrade: { value: 1 }, // 1 = NEUTRAL valeGrade; HD path sets 0 (raw linear → ACES post)
    uGreen: { value: 0.45 },
    uAutumn: { value: 0.35 },
  };
}

type RefUniforms = ReturnType<typeof refUniforms>;

/** One-time static HD uniforms; the day-phase palette is driven each tick. */
function applyHDPalette(u: RefUniforms) {
  u.uGrade.value = 0; // raw linear HDR out; the ACES post grades it
  u.uGreen.value = 0.55;
  u.uAutumn.value = 0.0;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Drives their palette uniforms from OUR day phase (their line-968 uVisW).
 *  HD path: deedy's HDR magnitudes (sun ~×10) driven by the day phase so the
 *  vale follows the cycle — warm at sunrise/sunset, bright at noon, dark at
 *  night — and the ACES post resolves it. Non-HD: the lower NEUTRAL palette. */
function useRefUniformDriver(sets: RefUniforms[], hd = false) {
  const lastRef = useRef(0);
  useFrame((_, dt) => {
    for (const u of sets) u.uTime.value += dt;
    const now = performance.now();
    if (now - lastRef.current < 200) return;
    lastRef.current = now;
    const phase = computeDayPhase(Date.now());
    const s = phase.sunDir;
    const lowSun = 1 - clamp01((s.y - 0.45) / 0.3);
    const east = s.x > 0 ? 1 : 0;
    if (hd) {
      const elN = clamp01(s.y);                        // 0 horizon .. 1 zenith
      const day = clamp01((s.y + 0.06) / 0.12);        // 0 deep night .. 1 sun up
      const warm = clamp01(1.0 - elN * 2.2);           // warm low, white high
      const sunG = 0.95 - warm * 0.43;
      const sunB = 0.85 - warm * 0.58;
      const mag = 10.5 * day * (0.45 + 0.55 * elN);
      for (const u of sets) {
        u.uSunDir.value.set(s.x, Math.max(s.y, 0.02), s.z).normalize();
        u.uSunColor.value.set(1.0, sunG, sunB).multiplyScalar(mag);
        u.uSkyZenith.value.set(0.21, 0.36, 0.65).multiplyScalar(0.10 + 0.90 * day);
        u.uHorizonCold.value.set(0.46, 0.55, 0.72).multiplyScalar(0.12 + 0.88 * day);
        u.uHorizonWarm.value.set(1.16, 0.55, 0.22).multiplyScalar(0.20 + 0.80 * day);
        u.uGroundBounce.value.set(0.10, 0.085, 0.07).multiplyScalar(0.10 + 0.90 * day);
        u.uVisW.value.set(lowSun * east, lowSun * (1 - east));
      }
      return;
    }
    const dayGate = clamp01((s.y + 0.05) / 0.15);
    const warm = 1 - clamp01((s.y - 0.12) / 0.3) * 0.55;
    for (const u of sets) {
      u.uSunDir.value.set(s.x, Math.max(s.y, 0.02), s.z).normalize();
      // Lower than the ref's HDR (the valeGrade pre-grade adds the contrast
      // back) so the NEUTRAL tonemap doesn't blow the lit ground to white.
      u.uSunColor.value.set(1.5, 1.5 - warm * 0.62, 1.5 - warm * 0.98).multiplyScalar(dayGate);
      u.uVisW.value.set(lowSun * east, lowSun * (1 - east));
    }
  });
}

export function buildMeshGeometry(grid: Float32Array): THREE.BufferGeometry {
  const res = GRID_RES;
  const step = (2 * GRID_HALF) / (res - 1);
  const geometry = new THREE.PlaneGeometry(GRID_HALF * 2, GRID_HALF * 2, MESH_SEG, MESH_SEG);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const mask = new Float32Array(pos.count);
  const sample = (x: number, z: number) => {
    const fx = Math.min(Math.max((x + GRID_HALF) / step, 0), res - 1.001);
    const fz = Math.min(Math.max((z + GRID_HALF) / step, 0), res - 1.001);
    const ix = Math.floor(fx); const iz = Math.floor(fz);
    const tx = fx - ix; const tz = fz - iz;
    const i0 = iz * res + ix;
    const a = grid[i0] + (grid[i0 + 1] - grid[i0]) * tx;
    const b = grid[i0 + res] + (grid[i0 + res + 1] - grid[i0 + res]) * tx;
    return a + (b - a) * tz;
  };
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, sample(x, z) + 0.15);
    // feather the overlay into the base chunks at the grid border
    const edge = Math.max(Math.abs(x), Math.abs(z)) / GRID_HALF;
    mask[i] = 1 - Math.min(1, Math.max(0, (edge - 0.86) / 0.12));
  }
  geometry.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/** Their grass blade verbatim: a 4-row plane tapering w0·(1-0.85t), y = t. */
function makeBladeGeometry(): THREE.BufferGeometry {
  const segs = 3;
  const w0 = 0.045;
  const bp: number[] = [];
  const bn: number[] = [];
  const bi: number[] = [];
  for (let s = 0; s <= segs; s += 1) {
    const t = s / segs;
    const w = w0 * (1 - t * 0.85);
    bp.push(-w, t, 0, w, t, 0);
    bn.push(0, 0, 1, 0, 0, 1);
  }
  for (let s = 0; s < segs; s += 1) {
    const a = s * 2;
    bi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bp), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(bn), 3));
  g.setIndex(bi);
  return g;
}

/** Coherent value noise for the patchy grass gate (their `vnoised` gate). */
function valeValueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const h = (i: number, j: number) => {
    let v = Math.imul(i, 374761393) ^ Math.imul(j, 668265263);
    v = Math.imul(v ^ (v >>> 13), 1274126177); v ^= v >>> 16;
    return (v >>> 0) / 4294967296;
  };
  const a = h(ix, iz) + (h(ix + 1, iz) - h(ix, iz)) * ux;
  const b = h(ix, iz + 1) + (h(ix + 1, iz + 1) - h(ix, iz + 1)) * ux;
  return a + (b - a) * uz;
}

/**
 * Their grass field: tiny tapered blades (scale 0.14–0.46), placed on the
 * low-slope valley floor/banks above the waterline, gated by a coherent noise
 * for dry patches (their exact placement rules). y = h-0.01 (rooted).
 */
export function buildGrassGeometry(grid: Float32Array): THREE.InstancedBufferGeometry {
  const blade = makeBladeGeometry();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = blade.index;
  geometry.attributes.position = blade.attributes.position;
  geometry.attributes.normal = blade.attributes.normal;
  const res = GRID_RES;
  const step = (2 * GRID_HALF) / (res - 1);
  const slopeAt = (ix: number, iz: number) => {
    const gx = (grid[iz * res + Math.min(res - 1, ix + 1)] - grid[iz * res + Math.max(0, ix - 1)]) / (2 * step);
    const gz = (grid[Math.min(res - 1, iz + 1) * res + ix] - grid[Math.max(0, iz - 1) * res + ix]) / (2 * step);
    return Math.hypot(gx, gz);
  };
  const random = seededRandom(0x6a55, 0xb1ad);
  const offsets = new Float32Array(GRASS_COUNT * 3);
  const params = new Float32Array(GRASS_COUNT * 4);
  let n = 0;
  let tries = 0;
  while (n < GRASS_COUNT && tries < GRASS_COUNT * 5) {
    tries += 1;
    const lx = (random() - 0.5) * 2 * (GRID_HALF - 30);
    const lz = (random() - 0.5) * 2 * (GRID_HALF - 30);
    const ix = Math.min(res - 2, Math.max(1, Math.floor((lx + GRID_HALF) / step)));
    const iz = Math.min(res - 2, Math.max(1, Math.floor((lz + GRID_HALF) / step)));
    const h = grid[iz * res + ix];
    const relH = h - WATER_Y;
    if (relH < 0.18 || relH > 30) continue;
    if (slopeAt(ix, iz) > 0.45) continue;
    const wx = GLACIAL_VALE.x + lx;
    const wz = GLACIAL_VALE.z + lz;
    if (valeValueNoise(wx * 0.045 + 7, wz * 0.045 + 7) < 0.24) continue; // dry patches
    offsets[n * 3] = wx;
    offsets[n * 3 + 1] = h - 0.01;
    offsets[n * 3 + 2] = wz;
    params[n * 4] = 0.14 + random() * 0.32;
    params[n * 4 + 1] = random() * Math.PI * 2;
    params[n * 4 + 2] = random() * 20;
    params[n * 4 + 3] = random();
    n += 1;
  }
  geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute('aParam', new THREE.InstancedBufferAttribute(params, 4));
  geometry.instanceCount = n;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(GLACIAL_VALE.x, 20, GLACIAL_VALE.z), GRID_HALF * 1.5);
  return geometry;
}

/** Their pebbles (icosa 1) on the shore band / boulders (icosa 3) anywhere. */
export function buildRocks(grid: Float32Array, count: number, big: boolean): THREE.InstancedBufferGeometry {
  const base = new THREE.IcosahedronGeometry(1, big ? 3 : 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.attributes.position = base.attributes.position;
  geometry.attributes.normal = base.attributes.normal;
  const res = GRID_RES;
  const step = (2 * GRID_HALF) / (res - 1);
  const random = seededRandom(big ? 0xb01d : 0x9ebb, 0x1e5);
  const offsets = new Float32Array(count * 3);
  const params = new Float32Array(count * 4);
  let n = 0;
  let tries = 0;
  while (n < count && tries < count * 14) {
    tries += 1;
    const lx = (random() - 0.5) * 2 * (GRID_HALF - 40);
    const lz = (random() - 0.5) * 2 * (GRID_HALF - 40);
    const i0 = Math.min(res - 2, Math.floor((lz + GRID_HALF) / step)) * res
      + Math.min(res - 2, Math.floor((lx + GRID_HALF) / step));
    const h = grid[i0];
    const relH = h - WATER_Y;
    const s = big ? 0.7 + Math.pow(random(), 1.6) * 2.4 : 0.05 + Math.pow(random(), 2.5) * 0.26;
    const yaw = random() * Math.PI * 2;
    const seed = random() * 100;
    const flat = 0.55 + random() * 0.5;
    if (big) { if (relH < -0.6 || relH > 30) continue; } else if (relH < -0.7 || relH > 1.6) continue;
    offsets[n * 3] = GLACIAL_VALE.x + lx;
    offsets[n * 3 + 1] = h + s * (big ? 0.12 : 0.25);
    offsets[n * 3 + 2] = GLACIAL_VALE.z + lz;
    params[n * 4] = s; params[n * 4 + 1] = yaw; params[n * 4 + 2] = seed; params[n * 4 + 3] = flat;
    n += 1;
  }
  geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute('aParam', new THREE.InstancedBufferAttribute(params, 4));
  geometry.instanceCount = n;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(GLACIAL_VALE.x, 10, GLACIAL_VALE.z), GRID_HALF * 1.5);
  return geometry;
}

export function GlacialValeTerrain() {
  const bake = useValeBake();
  if (!bake) return null;
  return <ValeMeshes bake={bake} />;
}

type BuiltVale = {
  ground: THREE.BufferGeometry;
  grass: THREE.InstancedBufferGeometry;
  pebbles: THREE.InstancedBufferGeometry;
  boulders: THREE.InstancedBufferGeometry;
  materials: THREE.ShaderMaterial[];
  uniforms: RefUniforms[];
};

/**
 * HD refraction pass (local dev only). Each frame, before the EffectComposer
 * renders, draw ONLY the vale bed (ground + rocks; the grass + everything else
 * is excluded by layer) to a half-res target and feed it to the water as tRefr
 * — deedy's screen-space refraction of the lit riverbed.
 */
const HD_REFR_CLEAR = new THREE.Color(0.5, 0.55, 0.72); // sky-ish: what grazing water refracts above the terrain
function ValeRefraction({ waterMat }: { waterMat: THREE.ShaderMaterial }) {
  const { gl, scene, camera, size } = useThree();
  // Half-res: the water blurs the refraction, so half the pixels is plenty and ~4x cheaper.
  const refrRT = useFBO(Math.max(2, size.width >> 1), Math.max(2, size.height >> 1), { type: THREE.HalfFloatType });
  const clearSave = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const savedMask = cam.layers.mask;
    const savedTarget = gl.getRenderTarget();
    const savedAuto = gl.shadowMap.autoUpdate;
    const savedAlpha = gl.getClearAlpha();
    gl.getClearColor(clearSave);
    cam.layers.set(VALE_BED_LAYER); // render the whole vale (ground+grass+rocks); water is excluded
    gl.shadowMap.autoUpdate = false;
    gl.setRenderTarget(refrRT);
    gl.setClearColor(HD_REFR_CLEAR, 1);
    gl.clear(true, true, false);
    gl.render(scene, cam);
    // restore
    gl.setRenderTarget(savedTarget);
    gl.setClearColor(clearSave, savedAlpha);
    gl.shadowMap.autoUpdate = savedAuto;
    cam.layers.mask = savedMask;
    const wu = waterMat.uniforms as { tRefr: { value: THREE.Texture | null }; uResolution: { value: THREE.Vector2 } };
    wu.tRefr.value = refrRT.texture;
    wu.uResolution.value.set(gl.domElement.width, gl.domElement.height);
  }, 0); // priority 0 → runs before the EffectComposer's render (priority 1)
  return null;
}

function ValeMeshes({ bake }: { bake: Bake }) {
  const builtRef = useRef<BuiltVale | null>(null);
  if (!builtRef.current) {
    const uniforms = [refUniforms(bake.tex), refUniforms(bake.tex), refUniforms(bake.tex), refUniforms(bake.tex)];
    if (VALE_HD) uniforms.forEach(applyHDPalette);
    const waterUniforms = VALE_HD
      ? Object.assign(uniforms[1], { tRefr: { value: null as THREE.Texture | null }, uResolution: { value: new THREE.Vector2(1, 1) } })
      : uniforms[1];
    builtRef.current = {
      ground: buildMeshGeometry(bake.grid),
      grass: buildGrassGeometry(bake.grid),
      pebbles: buildRocks(bake.grid, PEBBLE_COUNT, false),
      boulders: buildRocks(bake.grid, BOULDER_COUNT, true),
      uniforms,
      materials: [
        new THREE.ShaderMaterial({ uniforms: uniforms[0], vertexShader: REF_TERRAIN_VERT, fragmentShader: REF_TERRAIN_FRAG, transparent: !VALE_HD }),
        new THREE.ShaderMaterial({ uniforms: waterUniforms, vertexShader: REF_WATER_VERT, fragmentShader: VALE_HD ? REF_WATER_FRAG_HD : REF_WATER_FRAG, transparent: true, depthWrite: false }),
        new THREE.ShaderMaterial({ uniforms: uniforms[2], vertexShader: REF_GRASS_VERT, fragmentShader: REF_GRASS_FRAG, side: THREE.DoubleSide }),
        new THREE.ShaderMaterial({ uniforms: uniforms[3], vertexShader: REF_ROCK_VERT, fragmentShader: REF_ROCK_FRAG }),
      ],
    };
  }
  const b = builtRef.current;
  useRefUniformDriver(b.uniforms, VALE_HD);
  useEffect(() => () => {
    b.ground.dispose(); b.grass.dispose(); b.pebbles.dispose(); b.boulders.dispose();
    for (const m of b.materials) m.dispose();
  }, [b]);
  // HD: every vale mesh EXCEPT the water also renders on the bed layer, so the
  // refraction pass captures the full vale (ground+grass+rocks) the way deedy's
  // whole-scene refraction does — what the water samples at grazing angles.
  const onBed = VALE_HD ? (m: THREE.Mesh | null) => { if (m) m.layers.enable(VALE_BED_LAYER); } : undefined;
  return (
    <group>
      <mesh ref={onBed} geometry={b.ground} material={b.materials[0]} position={[GLACIAL_VALE.x, 0, GLACIAL_VALE.z]} raycast={() => null} />
      <mesh position={[GLACIAL_VALE.x, WATER_Y, GLACIAL_VALE.z]} rotation={[-Math.PI / 2, 0, 0]} material={b.materials[1]} raycast={() => null}>
        <planeGeometry args={[GRID_HALF * 1.7, GRID_HALF * 1.7, 1, 1]} />
      </mesh>
      <mesh ref={onBed} geometry={b.grass} material={b.materials[2]} raycast={() => null} />
      <mesh ref={onBed} geometry={b.pebbles} material={b.materials[3]} raycast={() => null} />
      <mesh ref={onBed} geometry={b.boulders} material={b.materials[3]} raycast={() => null} />
      {VALE_HD && <ValeRefraction waterMat={b.materials[1]} />}
    </group>
  );
}
