import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3D } from '../../../packages/protocol/messages';
import type { WorldArtQuality } from './world-art/quality';
import { STARTER_COZY_COAST } from './world-art/worldArtScenes';

/**
 * Shader grass — instanced blades in one custom ShaderMaterial, ported from the
 * "grass with triangles in GLSL" / "fluffiest grass" / ghibli-grass techniques.
 *
 * CAMERA-ADAPTIVE field (the thing that makes it work at any zoom). A fixed
 * budget of blades is TILED around the player in the vertex shader — each blade
 * holds a NORMALISED cell offset in [0,1)² and is placed at the copy of its cell
 * nearest the player on a grid of spacing `uPatch`. `uPatch` (and the blade
 * size) is driven from the live camera→player distance each frame, so the field
 * always fills the view: zoom in → tight spacing + small blades (fine lawn);
 * zoom out → wide spacing + bigger blades (the carpet still reaches the horizon)
 * — same blade count, constant GPU cost, no player-locked "island" disc and no
 * bald ground far out. Density falls off with ONE smooth dithered band that lands
 * at the fogged horizon (no hard ring, no sharp near/far step). When the camera
 * is still the field is perfectly world-stationary; blades only re-tile while you
 * are actively zooming.
 *
 * Each blade is a 3-segment ribbon (7 verts / 5 tris) with a constant forward arc
 * so it curls like grass instead of spiking; wind on the upper half; 3-stop
 * root→tip colour gradient + baked AO. Custom shading (not MeshStandard) avoids
 * the cyan bug (blades drinking blue hemisphere light). Ground height is
 * `getTerrainHeight` ported to GLSL so blades sit on WorldGround; grass is masked
 * off the coast sand (folded into the dither so there's no hard edge there).
 */
const SAND = { x: STARTER_COZY_COAST.waterline.x + 70, z: STARTER_COZY_COAST.waterline.z, r: 150 };

function grassCount(q: WorldArtQuality): number {
  if (q === 'high') return 340000;
  if (q === 'medium') return 150000;
  return 70000; // 'low' isn't mounted today (WorldScene gates on quality !== 'low')
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Env = { dayBright: number; fogColor: THREE.Color; fogNear: number; fogFar: number };

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
  uniform vec2  uSand;
  uniform float uSandR;
  uniform float uDayBright;
  attribute vec2 aOffset;   // per-instance NORMALISED cell offset, [0,1)
  attribute vec4 aRand;     // per-instance (heightScale, yaw, hueRand, leanRand)
  varying vec3 vColor;
  varying float vViewZ;

  float terrainH(vec2 p){
    float d = length(p);
    float spawnFade = smoothstep(80.0, 520.0, d);
    float broad  = sin(p.x*0.0017 + p.y*0.0009)*10.0;
    float ridges = sin((p.x-p.y)*0.0042)*cos((p.x+p.y)*0.0024)*5.0;
    float far    = sin(d*0.00016)*18.0*smoothstep(12000.0,90000.0,d);
    return (broad+ridges)*spawnFade + far;
  }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),
               mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }

  void main(){
    float side = position.x;
    float t    = position.y;   // 0 root .. 1 tip

    // Place this blade at the copy of its normalised cell nearest the player on
    // a grid of spacing uPatch → stationary (uPatch fixed) + fills the view as
    // uPatch tracks the camera distance.
    vec2 world = uPatch * (aOffset + floor(uPlayer/uPatch - aOffset + 0.5));
    float dist = length(world - uPlayer);

    // One smooth dithered falloff: dense out to ~0.30·patch, gone by ~0.47·patch
    // (before the tile wrap). Fold the coast-sand mask into the same dither so no
    // edge is ever a hard ring.
    float fall = 1.0 - smoothstep(uPatch*0.30, uPatch*0.47, dist);
    float sand = smoothstep(uSandR*0.6, uSandR, length(world - uSand)); // 0 on sand
    float present = step(hash(world*1.7), fall * sand);

    float clump = 0.6 + 0.4*smoothstep(0.25, 0.70, vnoise(world*0.04 + 7.0));
    float yaw   = aRand.y * 6.2831853;
    float h     = uBladeH * (0.6 + aRand.x*0.85) * clump;
    float width = uBladeH * 0.09 * (1.0 - t*t*0.8); // wide base, rounded taper
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
    col *= clamp(uDayBright, 0.40, 1.10);
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

function buildGeometry(count: number): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(BLADE_POS, 3));
  g.setIndex(BLADE_INDEX);
  const offset = new Float32Array(count * 2);
  const rand = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    offset[i * 2] = Math.random();       // normalised [0,1) — scaled by uPatch in the shader
    offset[i * 2 + 1] = Math.random();
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

export function WorldShaderGrass({ focus, quality }: { focus: Vec3D; quality: WorldArtQuality }) {
  const count = grassCount(quality);
  const geometry = useMemo(() => buildGeometry(count), [count]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uPlayer: { value: new THREE.Vector2() }, uPatch: { value: 320 },
      uBladeH: { value: 0.55 }, uSand: { value: new THREE.Vector2(SAND.x, SAND.z) }, uSandR: { value: SAND.r },
      uDayBright: { value: 1 }, uFogColor: { value: new THREE.Color('#cdd9e6') },
      uFogNear: { value: 600 }, uFogFar: { value: 5400 },
    },
  }), []);
  const { scene, camera } = useThree();
  const env = useRef<Env>({ dayBright: 1, fogColor: new THREE.Color('#cdd9e6'), fogNear: 600, fogFar: 5400 });
  const sunRef = useRef<THREE.DirectionalLight | null>(null);
  const camDistRef = useRef(60);
  const frameRef = useRef(0);

  // useMemo geometry/material aren't auto-disposed by R3F — release the GPU
  // buffers ourselves on unmount / recreation.
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dt) => {
    const u = material.uniforms;
    u.uTime.value += dt;
    u.uPlayer.value.set(focus.x, focus.z);

    // Drive field extent + blade size from the live camera→player distance so
    // the carpet fills the view at any zoom. Smoothed so it doesn't jitter.
    const cd = Math.hypot(camera.position.x - focus.x, camera.position.y - focus.y, camera.position.z - focus.z);
    camDistRef.current += (cd - camDistRef.current) * Math.min(1, dt * 4);
    const c = camDistRef.current;
    u.uPatch.value = clamp(c * 5, 220, 2200);
    u.uBladeH.value = 0.55 * clamp(Math.pow(c / 40, 0.6), 0.85, 3.2);

    // Shared environment (fog + day brightness); find the sun once, retrying
    // every ~30 frames until then (no per-frame full-scene traversal).
    const fog = scene.fog as THREE.Fog | null;
    if (fog?.color) { env.current.fogColor.copy(fog.color); env.current.fogNear = fog.near; env.current.fogFar = fog.far; }
    frameRef.current += 1;
    if (!sunRef.current && frameRef.current % 30 === 1) {
      scene.traverse((o) => { if ((o as THREE.DirectionalLight).isDirectionalLight) sunRef.current = o as THREE.DirectionalLight; });
    }
    if (sunRef.current) env.current.dayBright = 0.34 + sunRef.current.intensity * 0.5;
    u.uDayBright.value = env.current.dayBright;
    u.uFogColor.value.copy(env.current.fogColor);
    u.uFogNear.value = env.current.fogNear;
    u.uFogFar.value = env.current.fogFar;
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
