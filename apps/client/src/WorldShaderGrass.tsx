import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3D } from '../../../packages/protocol/messages';
import type { WorldArtQuality } from './world-art/quality';
import { STARTER_COZY_COAST } from './world-art/worldArtScenes';

/**
 * Shader grass — instanced blades in custom ShaderMaterials, ported from the
 * "grass with triangles in GLSL" / "fluffiest grass" / ghibli-grass three.js
 * techniques.
 *
 * A fixed set of blades is TILED around the player in the vertex shader (each
 * blade renders at the copy of its cell nearest the player), so a layer is
 * stationary in world space + effectively infinite at a constant cost — no chunk
 * streaming, no pop. Each blade is a 3-segment ribbon (7 verts / 5 tris) with a
 * constant forward arc so it curls like grass instead of spiking like a single
 * triangle; wind on the upper half; 3-stop root→tip colour gradient + baked AO.
 *
 * A single uniform-density field can't be both dense up close AND reach far
 * without an unaffordable blade count, so we stack LOD LAYERS (one draw call
 * each): a small-patch dense NEAR carpet, plus a large-patch sparse FAR field of
 * bigger blades that carries the green out toward the fog. The far layer fades
 * IN over the first metres (`innerFade`) so its tall blades don't crowd the
 * player's feet, and every layer thins out with a stable per-cell DITHER (no
 * hard ring). Custom shading (not MeshStandard) avoids the cyan bug (blades
 * drinking blue hemisphere light).
 *
 * The ground height is `getTerrainHeight` ported to GLSL verbatim, so blades sit
 * on the same surface WorldGround renders. Grass is masked out over the coast
 * sand (dithered into the distance fade so there is no hard ring there either).
 */
const SAND = { x: STARTER_COZY_COAST.waterline.x + 70, z: STARTER_COZY_COAST.waterline.z, r: 150 };

type Layer = { patch: number; count: number; hScale: number; wScale: number; innerFade: number };

function grassLayers(q: WorldArtQuality): Layer[] {
  // near: dense small blades up close. far: sparse BIG blades reaching toward fog.
  return q === 'high'
    ? [
        { patch: 100, count: 320000, hScale: 1.0, wScale: 1.0, innerFade: 0 },
        { patch: 720, count: 240000, hScale: 2.6, wScale: 2.1, innerFade: 34 },
      ]
    : [
        { patch: 92, count: 130000, hScale: 1.0, wScale: 1.0, innerFade: 0 },
        { patch: 560, count: 90000, hScale: 2.6, wScale: 2.1, innerFade: 34 },
      ];
}

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
  uniform float uHScale;
  uniform float uWScale;
  uniform float uInnerFade;
  uniform vec2  uSand;
  uniform float uSandR;
  uniform float uDayBright;
  attribute vec2 aOffset;   // per-instance cell offset
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

    // Nearest tiled copy of this blade to the player → stationary + infinite.
    vec2 world = aOffset + uPatch * floor((uPlayer - aOffset)/uPatch + 0.5);
    float dist = length(world - uPlayer);

    // Gradual dithered thinning instead of a hard fade ring: dense near, sparse
    // far. Fold in the sand mask + an inner fade (far layers ramp in past their
    // innerFade so the big blades don't crowd the player's feet).
    float fall = 1.0 - smoothstep(uPatch*0.16, uPatch*0.50, dist);
    float sand = smoothstep(uSandR*0.6, uSandR, length(world - uSand)); // 0 on sand
    float inner = mix(1.0, smoothstep(0.0, max(uInnerFade, 1.0), dist), step(0.5, uInnerFade));
    float present = step(hash(world*1.7), fall * sand * inner);

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

function GrassLayer({ layer, focus, env }: { layer: Layer; focus: Vec3D; env: MutableRefObject<Env> }) {
  const geometry = useMemo(() => buildGeometry(layer.count, layer.patch), [layer.count, layer.patch]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uPlayer: { value: new THREE.Vector2() }, uPatch: { value: layer.patch },
      uBladeH: { value: 0.55 }, uHScale: { value: layer.hScale }, uWScale: { value: layer.wScale },
      uInnerFade: { value: layer.innerFade }, uSand: { value: new THREE.Vector2(SAND.x, SAND.z) }, uSandR: { value: SAND.r },
      uDayBright: { value: 1 }, uFogColor: { value: new THREE.Color('#cdd9e6') },
      uFogNear: { value: 450 }, uFogFar: { value: 1120 },
    },
  }), [layer.patch, layer.hScale, layer.wScale, layer.innerFade]);

  // useMemo geometry/material aren't auto-disposed by R3F — release the GPU
  // buffers ourselves on unmount / recreation.
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dt) => {
    const u = material.uniforms;
    u.uTime.value += dt;
    u.uPlayer.value.set(focus.x, focus.z);
    const e = env.current;
    u.uDayBright.value = e.dayBright;
    u.uFogColor.value.copy(e.fogColor);
    u.uFogNear.value = e.fogNear;
    u.uFogFar.value = e.fogFar;
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

export function WorldShaderGrass({ focus, quality }: { focus: Vec3D; quality: WorldArtQuality }) {
  const layers = useMemo(() => grassLayers(quality), [quality]);
  const { scene } = useThree();
  const env = useRef<Env>({ dayBright: 1, fogColor: new THREE.Color('#cdd9e6'), fogNear: 450, fogFar: 1120 });
  const sunRef = useRef<THREE.DirectionalLight | null>(null);
  const frameRef = useRef(0);

  // Read the shared environment (fog + day brightness) once per frame for all
  // layers; find the sun once, retrying only every ~30 frames until then.
  useFrame(() => {
    const fog = scene.fog as THREE.Fog | null;
    if (fog?.color) { env.current.fogColor.copy(fog.color); env.current.fogNear = fog.near; env.current.fogFar = fog.far; }
    frameRef.current += 1;
    if (!sunRef.current && frameRef.current % 30 === 1) {
      scene.traverse((o) => { if ((o as THREE.DirectionalLight).isDirectionalLight) sunRef.current = o as THREE.DirectionalLight; });
    }
    if (sunRef.current) env.current.dayBright = 0.34 + sunRef.current.intensity * 0.5;
  });

  return <>{layers.map((layer, i) => <GrassLayer key={i} layer={layer} focus={focus} env={env} />)}</>;
}
