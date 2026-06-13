import { useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import * as THREE from 'three';
import {
  GLACIAL_VALE,
} from '../../../../packages/content/terrain';
import {
  useValeBake, refUniforms, buildMeshGeometry, buildGrassGeometry, buildRocks,
  GRID_HALF, WATER_Y, PEBBLE_COUNT, BOULDER_COUNT, type Bake,
} from '../world-art/GlacialValeTerrain';
import {
  REF_TERRAIN_VERT, REF_TERRAIN_FRAG,
  REF_WATER_VERT, REF_WATER_FRAG_HD,
  REF_GRASS_VERT, REF_GRASS_FRAG,
  REF_ROCK_VERT, REF_ROCK_FRAG,
  POST_VERT_HD, POST_FRAG_HD,
} from '../world-art/glacialRefShaders';

/**
 * PROTOTYPE (showroom ?scene=valeHD) — deedy/glacial-valley's actual RENDERER in
 * our R3F engine, fed by our terrain, viewed from a low (our-style) camera:
 *   pass 1  refraction: render the scene without water → refrRT (the lit bed)
 *   pass 2  scene: render everything (water samples refrRT) → sceneRT (linear HDR)
 *   pass 3  post: exposure + ACES + grade + vignette → screen
 * Linear render (NoToneMapping) + his HDR sun (×10.5). Local feasibility/perf
 * spike: NOT wired into the game, NOT shipped. An FPS readout is overlaid.
 */

// deedy's sunrise calibration (main.js): sun el 8°, az 10°, colour ×10.5
const SUN_EL = (8.0 * Math.PI) / 180;
const SUN_AZ = (10.0 * Math.PI) / 180;
const SUN_DIR = new THREE.Vector3(
  Math.cos(SUN_EL) * Math.cos(SUN_AZ), Math.sin(SUN_EL), Math.cos(SUN_EL) * Math.sin(SUN_AZ),
).normalize();

function applyDeedyPalette(u: ReturnType<typeof refUniforms>) {
  u.uSunDir.value.copy(SUN_DIR);
  u.uSunColor.value.set(1.0, 0.52, 0.27).multiplyScalar(10.5);
  u.uSkyZenith.value.set(0.21, 0.36, 0.65);
  u.uHorizonCold.value.set(0.46, 0.55, 0.72);
  u.uHorizonWarm.value.set(1.16, 0.55, 0.22);
  u.uGroundBounce.value.set(0.10, 0.085, 0.07);
  u.uVisW.value.set(1, 0); // morning shadow map
  u.uGreen.value = 0.55;
  u.uAutumn.value = 0.0;
}

type HDBuilt = {
  ground: THREE.BufferGeometry;
  grass: THREE.InstancedBufferGeometry;
  pebbles: THREE.InstancedBufferGeometry;
  boulders: THREE.InstancedBufferGeometry;
  matGround: THREE.ShaderMaterial;
  matWater: THREE.ShaderMaterial;
  matGrass: THREE.ShaderMaterial;
  matRock: THREE.ShaderMaterial;
  uniforms: ReturnType<typeof refUniforms>[];
};

function buildHD(bake: Bake): HDBuilt {
  const u = [refUniforms(bake.tex), refUniforms(bake.tex), refUniforms(bake.tex), refUniforms(bake.tex)];
  u.forEach(applyDeedyPalette);
  // water needs the refraction sampler + resolution
  const waterUniforms = {
    ...u[1],
    tRefr: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
  };
  return {
    ground: buildMeshGeometry(bake.grid),
    grass: buildGrassGeometry(bake.grid),
    pebbles: buildRocks(bake.grid, PEBBLE_COUNT, false),
    boulders: buildRocks(bake.grid, BOULDER_COUNT, true),
    uniforms: [u[0], waterUniforms as unknown as ReturnType<typeof refUniforms>, u[2], u[3]],
    matGround: new THREE.ShaderMaterial({ uniforms: u[0], vertexShader: REF_TERRAIN_VERT, fragmentShader: REF_TERRAIN_FRAG }),
    matWater: new THREE.ShaderMaterial({ uniforms: waterUniforms, vertexShader: REF_WATER_VERT, fragmentShader: REF_WATER_FRAG_HD }),
    matGrass: new THREE.ShaderMaterial({ uniforms: u[2], vertexShader: REF_GRASS_VERT, fragmentShader: REF_GRASS_FRAG, side: THREE.DoubleSide }),
    matRock: new THREE.ShaderMaterial({ uniforms: u[3], vertexShader: REF_ROCK_VERT, fragmentShader: REF_ROCK_FRAG }),
  };
}

export function ValeHD({ onFps }: { onFps?: (fps: number) => void }) {
  const bake = useValeBake();
  if (!bake) return null;
  return <ValeHDInner bake={bake} onFps={onFps} />;
}

function ValeHDInner({ bake, onFps }: { bake: Bake; onFps?: (fps: number) => void }) {
  const { gl, scene, camera, size } = useThree();
  const builtRef = useRef<HDBuilt | null>(null);
  if (!builtRef.current) builtRef.current = buildHD(bake);
  const b = builtRef.current;
  const waterRef = useRef<THREE.Mesh>(null);

  // render targets (auto-resize with the canvas)
  const refrRT = useFBO(size.width, size.height, { type: THREE.HalfFloatType });
  const sceneRT = useFBO(size.width, size.height, { type: THREE.HalfFloatType, samples: 4 });

  // fullscreen post quad (deedy's exposure + ACES)
  const post = useMemo(() => {
    const s = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null as THREE.Texture | null }, uExposure: { value: 1.12 } },
      vertexShader: POST_VERT_HD, fragmentShader: POST_FRAG_HD, depthTest: false, depthWrite: false,
    });
    s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    return { scene: s, cam, mat };
  }, []);

  const fps = useRef({ t: performance.now(), n: 0, ema: 60 });

  // take over rendering (priority 1 disables R3F's auto-render)
  useFrame((state, dt) => {
    for (const u of b.uniforms) u.uTime.value += dt;
    const water = waterRef.current;

    // pass 1 — refraction: scene without water → refrRT
    if (water) water.visible = false;
    gl.setRenderTarget(refrRT);
    gl.clear();
    gl.render(scene, camera);

    // feed the lit bed to the water
    (b.matWater.uniforms as { tRefr: { value: THREE.Texture | null }; uResolution: { value: THREE.Vector2 } })
      .tRefr.value = refrRT.texture;
    (b.matWater.uniforms as { uResolution: { value: THREE.Vector2 } })
      .uResolution.value.set(refrRT.width, refrRT.height);
    if (water) water.visible = true;

    // pass 2 — full scene (linear HDR) → sceneRT
    gl.setRenderTarget(sceneRT);
    gl.clear();
    gl.render(scene, camera);

    // pass 3 — post (exposure + ACES) → screen
    post.mat.uniforms.tScene.value = sceneRT.texture;
    gl.setRenderTarget(null);
    gl.render(post.scene, post.cam);

    // fps (ema)
    const f = fps.current;
    f.n += 1;
    const now = performance.now();
    if (now - f.t >= 500) {
      const inst = (f.n * 1000) / (now - f.t);
      f.ema = f.ema * 0.5 + inst * 0.5;
      f.t = now; f.n = 0;
      onFps?.(f.ema);
    }
  }, 1);

  return (
    <group>
      <mesh geometry={b.ground} material={b.matGround} position={[GLACIAL_VALE.x, 0, GLACIAL_VALE.z]} raycast={() => null} />
      <mesh ref={waterRef} position={[GLACIAL_VALE.x, WATER_Y, GLACIAL_VALE.z]} rotation={[-Math.PI / 2, 0, 0]} material={b.matWater} raycast={() => null}>
        <planeGeometry args={[GRID_HALF * 1.7, GRID_HALF * 1.7, 1, 1]} />
      </mesh>
      <mesh geometry={b.grass} material={b.matGrass} raycast={() => null} />
      <mesh geometry={b.pebbles} material={b.matRock} raycast={() => null} />
      <mesh geometry={b.boulders} material={b.matRock} raycast={() => null} />
    </group>
  );
}
