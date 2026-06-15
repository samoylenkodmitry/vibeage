import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { WorldEnvironment } from '../WorldEnvironment';
import { WorldGround } from '../WorldGround';
import { WorldShaderGrass } from '../WorldShaderGrass';
import { WorldFoliage } from '../WorldFoliage';
import { LakeWaters } from '../world-art/LakeWaters';
import { LUSH_VALE, LUSH_VALE_WATER_Y, lushValeRiverV } from '../../../../packages/content/terrain';

/**
 * LOCAL preview (`/showroom.html?scene=lushvale`) of the LUSH FOREST RIVER VALLEY
 * region now INTEGRATED into VibeAge's world: `packages/content/terrain.ts`
 * carves a winding river canyon and themes the region FOREST, so the game's OWN
 * terrain + shader-grass + foliage systems fill it (dense trees, lush grass).
 * This scene mounts those real systems at the vale's location, backend-free, so
 * the integrated region can be seen without logging into the live world.
 *
 * (Recreating Braffolk/fable5-world-demo's look — its WebGPU/WGSL engine has no
 * WebGL fallback, so the region is rebuilt with VibeAge's WebGL systems.)
 *
 *   ?phase=0.34  sun     ?cx,cy,cz / tx,ty,tz  camera / target (relative to the vale)
 */
const DAY_MS = 12 * 60 * 1000;
const QUALITY = 'high' as const;

// River water ribbon following the carved channel (valley-local u → world).
function riverGeometry(): THREE.BufferGeometry {
  const segs = 160, halfW = 8;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = (i / segs - 0.5) * 2 * (LUSH_VALE.L - 30);
    const vc = lushValeRiverV(u);
    for (const s of [-halfW, halfW]) {
      const v = vc + s;
      const wx = LUSH_VALE.x + u * LUSH_VALE.cos - v * LUSH_VALE.sin;
      const wz = LUSH_VALE.z + u * LUSH_VALE.sin + v * LUSH_VALE.cos;
      pos.push(wx, LUSH_VALE_WATER_Y, wz);
    }
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function River() {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const geom = useMemo(() => riverGeometry(), []);
  useEffect(() => () => geom.dispose(), [geom]);
  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.opacity = 0.84 + Math.sin(clock.elapsedTime * 0.7) * 0.04;
  });
  return (
    <mesh geometry={geom}>
      <meshStandardMaterial ref={matRef} color="#3b6b86" roughness={0.16} metalness={0.1} transparent opacity={0.85} side={THREE.DoubleSide} />
    </mesh>
  );
}

const NOOP = () => { /* preview: no click-to-move */ };

export function LushVale() {
  const params = new URLSearchParams(window.location.search);
  const num = (k: string, d: number) => { const v = Number(params.get(k)); return params.get(k) !== null && Number.isFinite(v) ? v : d; };
  const phase = num('phase', 0.34);
  useLayoutEffect(() => {
    const real = Date.now;
    const base = Math.floor(real() / DAY_MS) * DAY_MS + phase * DAY_MS;
    Date.now = () => base;
    return () => { Date.now = real; };
  }, [phase]);

  const focus = useMemo(() => ({ x: LUSH_VALE.x, y: 0, z: LUSH_VALE.z }), []);
  const camPos: [number, number, number] = [num('cx', LUSH_VALE.x - 160), num('cy', 38), num('cz', LUSH_VALE.z + 160)];
  const target: [number, number, number] = [num('tx', LUSH_VALE.x), num('ty', 2), num('tz', LUSH_VALE.z)];

  return (
    <Canvas
      shadows
      camera={{ position: camPos, fov: 55, near: 0.1, far: 4000 }}
      onCreated={({ gl }) => gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))}
    >
      <WorldEnvironment focus={focus} />
      <Suspense fallback={null}>
        <WorldGround focus={focus} onMove={NOOP} visualMode="textured" />
        <WorldShaderGrass focus={focus} quality={QUALITY} />
        <WorldFoliage focus={focus} quality={QUALITY} />
        <LakeWaters focus={focus} />
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
