import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3D } from '../../../packages/protocol/messages';
import { getTerrainHeight, sampleGrassDensity, TOWN_PLATEAUS } from '../../../packages/content/terrain';
import type { WorldArtQuality } from './world-art/quality';
import { GrassDensityField } from './world-art/grassDensityField';
import { STARTER_COZY_COAST } from './world-art/worldArtScenes';

/**
 * Shader grass — instanced blades in custom ShaderMaterials, ported from the
 * "grass with triangles in GLSL" / "fluffiest grass" / ghibli-grass techniques.
 *
 * WORLD-FIXED + reaches into the fog. Blades hold a per-instance cell offset and
 * are TILED around the player in the vertex shader (each renders at the copy of
 * its cell nearest the player), so a blade's world position is a pure function
 * of its own cell — it never depends on the camera. That means the field does
 * NOT move when you zoom, and does not slide when you walk (the re-tile at the
 * patch edge only ever touches blades that are already culled by the distance
 * fade, so it's invisible).
 *
 * A top-down camera sees hundreds of metres of ground, so density MUST fall off
 * with distance — the art is hiding the falloff. We stack three FIXED scales
 * (one draw call each): a dense NEAR carpet, a MEDIUM mid band, and a sparse FAR
 * field of big blades that thins out inside the fog (~600 m) so there is no bald
 * band in clear view. Mid/far ramp IN past their `innerFade` so they don't crowd
 * the player's feet; every layer thins with a stable per-cell DITHER (no ring).
 *
 * Each blade is a 3-segment ribbon (7 verts / 5 tris) with a forward arc so it
 * curls like grass; wind on the upper half; 3-stop root→tip gradient + baked AO.
 * Custom shading (not MeshStandard) avoids the cyan bug. Ground height is
 * `getTerrainHeight` ported to GLSL so blades sit on WorldGround; the coast sand
 * mask is folded into the dither so there is no hard edge there either.
 */
const SAND = { x: STARTER_COZY_COAST.waterline.x + 70, z: STARTER_COZY_COAST.waterline.z, r: 150 };

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

type Layer = { patch: number; count: number; hScale: number; wScale: number; innerFade: number };

function grassLayers(q: WorldArtQuality): Layer[] {
  // patch = how far this scale reaches (~0.47·patch); count/patch² = its density.
  // near: dense small blades. mid: fills the clear-view middle distance. far:
  // sparse big blades that dissolve into the fog band (fogNear 600) so the field
  // never ends at a visible bald line.
  if (q === 'high') {
    return [
      { patch: 130, count: 340000, hScale: 1.0, wScale: 1.0, innerFade: 0 },
      { patch: 460, count: 520000, hScale: 1.5, wScale: 1.3, innerFade: 40 },
      { patch: 1300, count: 280000, hScale: 2.8, wScale: 2.2, innerFade: 150 },
    ];
  }
  if (q === 'medium') {
    return [
      { patch: 120, count: 150000, hScale: 1.0, wScale: 1.0, innerFade: 0 },
      { patch: 440, count: 220000, hScale: 1.5, wScale: 1.3, innerFade: 40 },
      { patch: 1100, count: 110000, hScale: 2.8, wScale: 2.2, innerFade: 150 },
    ];
  }
  // 'low' isn't mounted today (WorldScene gates on quality !== 'low').
  return [{ patch: 150, count: 70000, hScale: 1.0, wScale: 1.0, innerFade: 0 }];
}

// One blade template: rows at t = 0, 1/3, 2/3 are 2 wide (side ±1), tip is a
// single point (side 0). position = (side, t, _). Shared by every instance.
const BLADE_POS = new Float32Array([
  -1, 0, 0, 1, 0, 0,
  -1, 0.3333, 0, 1, 0.3333, 0,
  -1, 0.6667, 0, 1, 0.6667, 0,
  0, 1, 0,
]);
const BLADE_INDEX = [0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5, 4, 6, 5];

const VERT = /* glsl */`
  uniform float uTime;
  uniform vec2  uPlayer;
  uniform float uPatch;
  uniform float uBladeH;
  uniform float uHScale;
  uniform float uWScale;
  uniform float uInnerFade;
  uniform sampler2D uDensityMap; // baked biome grass density × coast mask
  uniform vec2  uDensityCenter;
  uniform float uDensityHalf;
  uniform float uDayBright;
  uniform vec3  uSunDir;    // normalised direction to the sun (world)
  uniform vec3  uSunColor;
  attribute vec2 aOffset;   // per-instance cell offset, [-patch/2, patch/2]
  attribute vec4 aRand;     // per-instance (heightScale, yaw, hueRand, leanRand)
  varying vec3 vColor;
  varying float vViewZ;

  // EXACT mirror of getTerrainHeight (packages/content/terrain.ts) — change
  // both together or blades float/sink against the ground mesh.
  float terrainH(vec2 p){
    float d = length(p);
    if (d <= 430.0) return 0.0; // flat spawn zone — mirrors the JS early-out
    float spawnFade = smoothstep(430.0, 900.0, d);
    float hills = sin(p.x*0.009 + p.y*0.006)*9.0
                + sin(p.x*0.0042 - p.y*0.0051 + 1.7)*14.0
                + sin((p.x+p.y)*0.017 + 0.6)*2.5;
    float ridgePhase = p.x*0.0014 + p.y*0.0011 + sin(p.y*0.0008 - p.x*0.0005)*1.4;
    float ridgeShape = 1.0 - abs(sin(ridgePhase));
    float mountainMask = smoothstep(0.3, 0.8, sin(p.x*0.00093 + 1.3)*cos(p.y*0.00078 - 0.7));
    float mountains = ridgeShape*ridgeShape*48.0*mountainMask;
    float valleys = -smoothstep(0.55, 0.95, sin(p.x*0.0011 - 0.4)*sin(p.y*0.0013 + 2.0))*16.0;
    float canyonPath = sin(p.x*0.00037 + sin(p.y*0.00022)*2.1)
                     + cos(p.y*0.00031 + sin(p.x*0.00018)*1.7);
    float canyonRegion = smoothstep(0.25, 0.75, sin(p.x*0.00011 - 2.0)*sin(p.y*0.00009 + 1.1));
    float canyonWall = 1.0 - smoothstep(0.0, 0.22, abs(canyonPath));
    float canyons = -canyonWall*canyonWall*55.0*canyonRegion;
    float far = sin(d*0.00016)*18.0*smoothstep(12000.0,90000.0,d);
    float base = (hills + mountains + valleys + canyons)*spawnFade + far;
    float lakeField = sin(p.x*0.0013 + 0.9)*sin(p.y*0.00117 - 1.6);
    float lakeMask = smoothstep(0.93, 0.985, lakeField)*smoothstep(900.0, 1300.0, d);
    float h = base*(1.0 - lakeMask) + (-11.0)*lakeMask;
    // Settlement plateaus — mirrors TOWN_PLATEAUS in terrain.ts exactly.
    float tm;
    tm = 1.0 - smoothstep(84.0, 168.0, length(p - vec2(-1450.0, 80.0)));   h = mix(h, 16.0, max(tm, 0.0));
    tm = 1.0 - smoothstep(77.0, 154.0, length(p - vec2(560.0, -2080.0)));  h = mix(h, 3.0, max(tm, 0.0));
    tm = 1.0 - smoothstep(56.0, 112.0, length(p - vec2(3600.0, -2520.0))); h = mix(h, 26.0, max(tm, 0.0));
    return h;
  }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),
               mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }

  void main(){
    float side = position.x;
    float t    = position.y;   // 0 root .. 1 tip

    // Copy of this blade's cell nearest the player → world-fixed (never depends
    // on the camera) + tiles to fill the field.
    vec2 world = aOffset + uPatch * floor((uPlayer - aOffset)/uPatch + 0.5);
    float dist = length(world - uPlayer);

    // One smooth dithered falloff (dense to ~0.30·patch, gone by ~0.47·patch),
    // with the biome density map (low over sand/dirt/scorched, baked with the
    // coast mask) + an inner ramp (mid/far layers start past innerFade) folded
    // into the same dither so no edge is ever a hard ring.
    float fall = 1.0 - smoothstep(uPatch*0.30, uPatch*0.47, dist);
    vec2  duv  = (world - uDensityCenter) / (2.0 * uDensityHalf) + 0.5;
    float biome = texture2D(uDensityMap, duv).r; // 0 bare .. ~0.9 lush meadow
    float inner = mix(1.0, smoothstep(0.0, max(uInnerFade, 1.0), dist), step(0.5, uInnerFade));
    float present = step(hash(world*1.7), fall * inner * biome);

    float clump = 0.6 + 0.4*smoothstep(0.25, 0.70, vnoise(world*0.04 + 7.0));
    float yaw   = aRand.y * 6.2831853;
    float h     = uBladeH * uHScale * (0.6 + aRand.x*0.85) * clump;
    float width = uBladeH * uWScale * 0.09 * (1.0 - t*t*0.8); // wide base, rounded taper
    vec2 facing = vec2(cos(yaw), sin(yaw));
    vec2 sideAx = vec2(-facing.y, facing.x);

    vec3 pos = vec3(world.x, terrainH(world), world.y);
    pos.xz += sideAx * (side * width);
    pos.y  += t * h;
    // Constant forward arc so the blade curls over (not a rigid spike).
    vec2 lean = vec2(cos(yaw+0.6), sin(yaw+0.6));
    pos.xz += lean * (0.16 + aRand.w*0.45) * h * t * t;
    // Wind on the upper half.
    float w  = vnoise(world*0.05 + uTime*0.22)*2.0 - 1.0;
    float w2 = sin(world.x*0.25 + world.y*0.2 + uTime*1.6);
    pos.xz += vec2(0.72, 0.3) * (w*0.55 + w2*0.45) * h * 0.4 * t * t;
    if (present < 0.5) pos = vec3(0.0, -10000.0, 0.0); // hide culled blades

    vec3 baseCol = vec3(0.05, 0.13, 0.04);
    vec3 midCol  = vec3(0.18, 0.36, 0.11);
    vec3 tipCol  = vec3(0.42, 0.62, 0.24);
    vec3 col = t < 0.5 ? mix(baseCol, midCol, t*2.0) : mix(midCol, tipCol, t*2.0 - 1.0);
    col *= 0.82 + 0.36*aRand.z;        // per-blade hue/value variation
    col *= 0.45 + 0.55*t;              // baked AO — dark at the root

    // Sun-direction shading: blades facing the sun catch warm light, those
    // turned away fall into deeper shade — only while the sun is up, so night is
    // unchanged. The blade is a near-vertical ribbon, so its broad-face normal is
    // ~its facing direction tilted up; per-blade yaw gives a dappled meadow.
    float sunUp = clamp(uSunDir.y * 2.2, 0.0, 1.0);
    vec3  N     = normalize(vec3(facing.x, 0.55, facing.y));
    float ndl   = max(dot(N, uSunDir), 0.0);
    float shade = mix(1.0, 0.72 + 0.46*ndl, sunUp);
    vec3  sunTint = mix(vec3(1.0), uSunColor*1.4, ndl*0.30*sunUp);
    col *= clamp(uDayBright, 0.05, 1.10) * shade * sunTint; // floor low; the JS night base is the real knob
    vColor = col;

    vec4 mv = viewMatrix * vec4(pos, 1.0);
    vViewZ = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  uniform vec3  uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vColor;
  varying float vViewZ;
  void main(){
    float fog = clamp((vViewZ - uFogNear)/(uFogFar - uFogNear), 0.0, 1.0);
    gl_FragColor = vec4(mix(vColor, uFogColor, fog), 1.0);
  }
`;

function buildGeometry(count: number, patch: number): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(BLADE_POS, 3));
  g.setIndex(BLADE_INDEX);
  const offset = new Float32Array(count * 2);
  const rand = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    offset[i * 2] = (Math.random() - 0.5) * patch;
    offset[i * 2 + 1] = (Math.random() - 0.5) * patch;
    rand[i * 4] = Math.random();
    rand[i * 4 + 1] = Math.random();
    rand[i * 4 + 2] = Math.random();
    rand[i * 4 + 3] = Math.random();
  }
  g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 2));
  g.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 4));
  g.instanceCount = count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // never frustum-cull
  return g;
}

function buildMaterial(layer: Layer, field: GrassDensityField): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uPlayer: { value: new THREE.Vector2() }, uPatch: { value: layer.patch },
      uBladeH: { value: 0.55 }, uHScale: { value: layer.hScale }, uWScale: { value: layer.wScale },
      uInnerFade: { value: layer.innerFade },
      uDensityMap: { value: field.texture }, uDensityCenter: { value: new THREE.Vector2() }, uDensityHalf: { value: field.half },
      uDayBright: { value: 1 }, uFogColor: { value: new THREE.Color('#cdd9e6') },
      uFogNear: { value: 600 }, uFogFar: { value: 5400 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color('#fff1d0') },
    },
  });
}

const TMP_SUNDIR = new THREE.Vector3();

export function WorldShaderGrass({ focus, quality }: { focus: Vec3D; quality: WorldArtQuality }) {
  const layers = useMemo(() => grassLayers(quality), [quality]);

  // Biome grass-density map (low over sand/dirt/scorched), with the cozy-coast
  // sand mask baked in so the beach reads as bare sand too.
  const field = useRef<GrassDensityField>(null!);
  if (!field.current) field.current = new GrassDensityField();
  const densityFn = useMemo(() => (x: number, z: number) => {
    const coast = smoothstep(SAND.r * 0.6, SAND.r, Math.hypot(x - SAND.x, z - SAND.z)); // 0 on sand
    // No grass under lake water: fade out as the terrain dips below the
    // waterline (LAKE_WATER_Y = -4) so shores keep grass and beds go bare.
    const dry = smoothstep(-5.5, -3.5, getTerrainHeight(x, z));
    // Settlement plazas are trodden ground — grass fades inside the plateau.
    let plaza = 1;
    for (const p of TOWN_PLATEAUS) plaza *= smoothstep(p.r * 0.55, p.r, Math.hypot(x - p.x, z - p.z));
    return sampleGrassDensity(x, z) * coast * dry * plaza;
  }, []);

  // One geometry + material per layer, built once. Everything is mutated in the
  // SINGLE useFrame below (not in per-layer child components) so the layers and
  // the density-map swap update in one deterministic pass — no swap-frame flicker.
  const meshes = useMemo(
    () => layers.map((layer) => ({ geometry: buildGeometry(layer.count, layer.patch), material: buildMaterial(layer, field.current) })),
    [layers],
  );
  useEffect(() => () => {
    field.current.dispose();
    meshes.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
  }, [meshes]);

  const sunRef = useRef<THREE.DirectionalLight | null>(null);
  const frameRef = useRef(0);

  useFrame(({ scene }, dt) => {
    // Find the sun once (retry every ~30 frames), read fog, re-bake the density
    // map, then push the shared values into every layer's uniforms.
    frameRef.current += 1;
    if (!sunRef.current && frameRef.current % 30 === 1) {
      scene.traverse((o) => { if ((o as THREE.DirectionalLight).isDirectionalLight) sunRef.current = o as THREE.DirectionalLight; });
    }
    const fog = scene.fog as THREE.Fog | null;
    const sun = sunRef.current;
    field.current.update(focus.x, focus.z, densityFn);
    const cx = Number.isNaN(field.current.centerX) ? focus.x : field.current.centerX;
    const cz = Number.isNaN(field.current.centerZ) ? focus.z : field.current.centerZ;
    // Night base lowered (was 0.34) so the grass settles into the night mood.
    const dayBright = sun ? 0.26 + sun.intensity * 0.53 : 1;
    // Sun direction: WorldEnvironment offsets the sun's X/Z by focus but its Y is
    // absolute (sunDir.y·distance), so don't subtract focus.y from Y.
    if (sun) TMP_SUNDIR.set(sun.position.x - focus.x, sun.position.y, sun.position.z - focus.z).normalize();

    for (const { material } of meshes) {
      const u = material.uniforms;
      u.uTime.value += dt;
      u.uPlayer.value.set(focus.x, focus.z);
      u.uDensityCenter.value.set(cx, cz);
      if (fog?.color) { u.uFogColor.value.copy(fog.color); u.uFogNear.value = fog.near; u.uFogFar.value = fog.far; }
      if (sun) { u.uDayBright.value = dayBright; u.uSunDir.value.copy(TMP_SUNDIR); u.uSunColor.value.copy(sun.color); }
    }
  });

  return <>{meshes.map((m, i) => <mesh key={i} geometry={m.geometry} material={m.material} frustumCulled={false} />)}</>;
}
