import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { WorldEnvironment } from '../WorldEnvironment';

/**
 * LOCAL preview (`/showroom.html?scene=lushvale`) — a lush forest river valley,
 * recreating the look of Braffolk/fable5-world-demo (LAAS) in VibeAge's WebGL
 * stack. (LAAS itself is a WebGPU/WGSL-compute engine with no WebGL fallback, so
 * it can't be ported literally — this rebuilds the *aesthetic*: rolling green
 * grass with dry patches, a river carved into a canyon with layered grey rock
 * strata walls, mixed forest, hazy mountains.) Backend-free, screenshot target.
 *
 * Self-contained for now (a new world LOCATION wired into the live terrain comes
 * later); the heightfield is baked once on a fixed grid.
 *
 *   ?phase=0.34   day-phase (sun)    ?cx,cy,cz / tx,ty,tz   camera / target
 */
const GRID = 220;        // vertices per side
const HALF = 200;        // metres from centre to edge
const STEP = (HALF * 2) / (GRID - 1);
const RIVER_Y = -1.4;    // water surface height in the channel

// ---- procedural heightfield ------------------------------------------------
function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, z: number): number {
  let f = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < 5; i++) { f += amp * valueNoise(x * freq, z * freq); freq *= 2.03; amp *= 0.5; }
  return f;
}

// River centreline winds in Z as a function of X; the channel is carved down
// with steep banks (→ exposed rock strata) into rolling fbm hills.
function riverCenterZ(x: number): number {
  return Math.sin(x * 0.011) * 46 + Math.sin(x * 0.043 + 1.3) * 12;
}
function lushHeight(x: number, z: number): number {
  const hills = (fbm(x * 0.011 + 11, z * 0.011 - 7) - 0.5) * 46 + (fbm(x * 0.05, z * 0.05) - 0.5) * 7;
  const base = 8 + hills;
  // Carve the river into a CANYON: a flat bed at the centreline, then steep rock
  // walls over a short span (≈9 m → ~50° → exposed rock strata), into the hills.
  const d = Math.abs(z - riverCenterZ(x));
  const carve = 1 - smooth(5, 14, d); // sharp bank, not a gentle grassy slope
  const bed = RIVER_Y - 2.2;
  return base * (1 - carve) + bed * carve;
}
function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function bakeGrid(): Float32Array {
  const h = new Float32Array(GRID * GRID);
  for (let r = 0; r < GRID; r++) {
    const z = -HALF + r * STEP;
    for (let c = 0; c < GRID; c++) {
      h[r * GRID + c] = lushHeight(-HALF + c * STEP, z);
    }
  }
  return h;
}

function buildTerrainGeometry(h: Float32Array): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(HALF * 2, HALF * 2, GRID - 1, GRID - 1);
  g.rotateX(-Math.PI / 2); // lie flat; plane's local +Y becomes world up
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, h[i]);
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// ---- lush terrain material -------------------------------------------------
// MeshStandard so it picks up WorldEnvironment's sun / fog / tone, with the
// diffuse colour replaced by a procedural lush palette: green grass dappled with
// dry patches on the gentle ground, grey horizontally-banded rock on steep banks.
function useLushMaterial(): THREE.MeshStandardMaterial {
  return useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.97, metalness: 0.0 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n varying vec3 vWPos; varying vec3 vWNrm;')
        .replace('#include <worldpos_vertex>',
          '#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed,1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos; varying vec3 vWNrm;
          float h2(vec2 p){ p = fract(p*0.3183+0.1); p*=17.0; return fract(p.x*p.y*(p.x+p.y)); }
          float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
          float fbm2(vec2 p){ float a=0.5,v=0.0; for(int i=0;i<4;i++){v+=a*n2(p);p*=2.03;a*=0.5;} return v; }`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
          float slope = 1.0 - clamp(vWNrm.y, 0.0, 1.0);
          // grass: lush green dappled with drier olive patches (low-freq noise)
          float dry = smoothstep(0.45, 0.72, fbm2(vWPos.xz * 0.018));
          vec3 grassLush = vec3(0.18, 0.40, 0.14);
          vec3 grassDry  = vec3(0.46, 0.46, 0.22);
          vec3 grass = mix(grassLush, grassDry, dry * 0.7);
          // fine green break-up so it isn't flat
          grass *= 0.82 + 0.30 * fbm2(vWPos.xz * 0.12);
          // rock: grey horizontal strata on the steep canyon banks
          float band = 0.5 + 0.5 * sin(vWPos.y * 1.6 + fbm2(vWPos.xz * 0.3) * 2.0);
          vec3 rock = mix(vec3(0.40,0.40,0.42), vec3(0.62,0.61,0.58), band);
          rock *= 0.85 + 0.2 * n2(vWPos.xz * 0.6);
          float rockF = smoothstep(0.34, 0.58, slope);
          // a little wet/dark margin right at the waterline
          float wet = smoothstep(${(RIVER_Y + 0.6).toFixed(2)}, ${(RIVER_Y - 0.4).toFixed(2)}, vWPos.y);
          vec3 col = mix(grass, rock, rockF);
          col *= 1.0 - wet * 0.35;
          vec4 diffuseColor = vec4( col, opacity );`);
    };
    return mat;
  }, []);
}

function LushTerrain() {
  const h = useMemo(() => bakeGrid(), []);
  const geom = useMemo(() => buildTerrainGeometry(h), [h]);
  const mat = useLushMaterial();
  return <mesh geometry={geom} material={mat} receiveShadow castShadow />;
}

function River() {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.opacity = 0.82 + Math.sin(clock.elapsedTime * 0.8) * 0.04;
  });
  // A long water ribbon following the river; the terrain's carved channel holds it.
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(HALF * 2, 60, 120, 1);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + riverCenterZ(pos.getX(i)));
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geom} position={[0, RIVER_Y, 0]}>
      <meshStandardMaterial ref={matRef} color="#3b6b86" roughness={0.18} metalness={0.1} transparent opacity={0.85} />
    </mesh>
  );
}

const DAY_MS = 12 * 60 * 1000;

export function LushVale() {
  const params = new URLSearchParams(window.location.search);
  const num = (k: string, d: number) => { const v = Number(params.get(k)); return params.get(k) !== null && Number.isFinite(v) ? v : d; };
  const phase = num('phase', 0.34); // summer mid-morning sun by default
  // Pin the day-phase clock so the sun is stable across screenshots (restored on
  // unmount). R3F's perf clock is untouched, so water/clouds keep animating.
  useLayoutEffect(() => {
    const real = Date.now;
    const base = Math.floor(real() / DAY_MS) * DAY_MS + phase * DAY_MS;
    Date.now = () => base;
    return () => { Date.now = real; };
  }, [phase]);
  const focus = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);
  const camPos: [number, number, number] = [num('cx', -120), num('cy', 34), num('cz', 120)];
  const target: [number, number, number] = [num('tx', 0), num('ty', 2), num('tz', 0)];
  return (
    <Canvas
      shadows
      camera={{ position: camPos, fov: 55, near: 0.1, far: 3000 }}
      onCreated={({ gl }) => gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))}
    >
      <WorldEnvironment focus={focus} />
      <Suspense fallback={null}>
        <LushTerrain />
        <River />
      </Suspense>
      <OrbitControls target={target} enableDamping />
      <EffectComposer enableNormalPass={false} multisampling={0}>
        <Bloom intensity={0.5} luminanceThreshold={0.7} luminanceSmoothing={0.18} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <HueSaturation hue={0} saturation={0.14} />
        <BrightnessContrast brightness={0} contrast={0.08} />
      </EffectComposer>
    </Canvas>
  );
}
