import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3D } from '../../../packages/protocol/messages';
import type { WorldArtQuality } from './world-art/quality';
import { STARTER_COZY_COAST } from './world-art/worldArtScenes';

/**
 * Shader grass — instanced blades in one custom ShaderMaterial, ported from the
 * "grass with triangles in GLSL" / "fluffiest grass" three.js techniques.
 *
 * One draw call. A fixed set of blades is TILED around the player in the vertex
 * shader (each blade renders at the copy of its cell nearest the player), so the
 * field is dense + stationary in world space + effectively infinite with a
 * constant cost — no chunk streaming, no fade ring, no pop. Custom shading (not
 * MeshStandard) keeps the blades from drinking the blue hemisphere light (the
 * old cyan bug); the look comes from a root→tip colour gradient with a dark
 * baked-AO base, per-blade variation, wind that bends the tip while the root
 * stays planted, and the scene fog so it recedes with the rest of the world.
 *
 * The ground height is `getTerrainHeight` ported to GLSL verbatim, so blades sit
 * on the same surface WorldGround renders. Grass is masked out over the coast
 * sand and thinned by a low-frequency noise for natural patchiness.
 */
const SAND = { x: STARTER_COZY_COAST.waterline.x + 70, z: STARTER_COZY_COAST.waterline.z, r: 150 };

function grassParams(q: WorldArtQuality) {
  return q === 'high' ? { patch: 150, count: 60000 } : { patch: 96, count: 22000 };
}

const VERT = /* glsl */`
  uniform float uTime;
  uniform vec2  uPlayer;
  uniform float uPatch;
  uniform float uBladeH;
  uniform vec2  uSand;
  uniform float uSandR;
  uniform float uDayBright;
  attribute vec2 aCorner;   // (side -1/0/+1, heightFactor 0/1)
  attribute vec2 aOffset;   // per-instance cell offset
  attribute vec3 aRand;     // per-instance (heightScale, yaw, colourRand)
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
    // Nearest tiled copy of this blade to the player → stationary + infinite.
    vec2 world = aOffset + uPatch * floor((uPlayer - aOffset)/uPatch + 0.5);
    float dist = length(world - uPlayer);
    float edge = 1.0 - smoothstep(uPatch*0.34, uPatch*0.48, dist);
    float sand = smoothstep(uSandR*0.55, uSandR, length(world - uSand)); // 0 on sand
    float patch = smoothstep(0.20, 0.62, vnoise(world*0.035 + 11.0));
    float present = edge * sand * (0.45 + 0.55*patch);

    float hf = aCorner.y, side = aCorner.x;
    float yaw = aRand.y * 6.2831853;
    float bladeH = uBladeH * (0.55 + aRand.x*0.95) * present;
    float width  = uBladeH * 0.075 * (1.0 - hf*0.9);
    vec3 sideDir = vec3(cos(yaw), 0.0, sin(yaw));
    vec3 pos = vec3(world.x, terrainH(world), world.y);
    pos += sideDir * (side * width);
    pos.y += hf * bladeH;
    // Wind: bend the tip (hf^2), root planted.
    float w = vnoise(world*0.05 + uTime*0.22)*2.0 - 1.0;
    float w2 = sin(world.x*0.25 + world.y*0.2 + uTime*1.6);
    pos.xz += vec2(0.72, 0.3) * (w*0.6 + w2*0.4) * bladeH * 0.45 * hf*hf;
    if (present < 0.02) pos.y = -10000.0; // hide culled blades

    vec3 baseCol = vec3(0.07, 0.17, 0.05);
    vec3 tipCol  = vec3(0.40, 0.60, 0.21);
    vec3 col = mix(baseCol, tipCol, hf);
    col *= 0.78 + 0.42*aRand.z;        // per-blade hue/value variation
    col *= 0.5 + 0.5*hf;               // baked AO — dark at the root
    col *= clamp(uDayBright, 0.34, 1.06);
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
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute([-1, 0, 1, 0, 0, 1], 2));
  const offset = new Float32Array(count * 2);
  const rand = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    offset[i * 2] = (Math.random() - 0.5) * patch;
    offset[i * 2 + 1] = (Math.random() - 0.5) * patch;
    rand[i * 3] = Math.random();
    rand[i * 3 + 1] = Math.random();
    rand[i * 3 + 2] = Math.random();
  }
  g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 2));
  g.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 3));
  g.instanceCount = count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // never frustum-cull
  return g;
}

export function WorldShaderGrass({ focus, quality }: { focus: Vec3D; quality: WorldArtQuality }) {
  const { patch, count } = grassParams(quality);
  const geometry = useMemo(() => buildGeometry(count, patch), [count, patch]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uPlayer: { value: new THREE.Vector2() }, uPatch: { value: patch },
      uBladeH: { value: 0.62 }, uSand: { value: new THREE.Vector2(SAND.x, SAND.z) }, uSandR: { value: SAND.r },
      uDayBright: { value: 1 }, uFogColor: { value: new THREE.Color('#cdd9e6') },
      uFogNear: { value: 450 }, uFogFar: { value: 1120 },
    },
  }), [patch]);
  const { scene } = useThree();
  const sunRef = useRef<THREE.DirectionalLight | null>(null);

  useFrame((_, dt) => {
    const u = material.uniforms;
    u.uTime.value += dt;
    u.uPlayer.value.set(focus.x, focus.z);
    const fog = scene.fog as THREE.Fog | null;
    if (fog?.color) { u.uFogColor.value.copy(fog.color); u.uFogNear.value = fog.near; u.uFogFar.value = fog.far; }
    if (!sunRef.current) scene.traverse((o) => { if ((o as THREE.DirectionalLight).isDirectionalLight) sunRef.current = o as THREE.DirectionalLight; });
    if (sunRef.current) u.uDayBright.value = 0.34 + sunRef.current.intensity * 0.5;
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
