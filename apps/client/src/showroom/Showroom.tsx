import { Suspense, useLayoutEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { WorldEnvironment } from '../WorldEnvironment';
import { AnimatedCharacter } from '../AnimatedCharacter';
import { CHARACTER_MODELS, enemyModel, type CharacterAnim, type CharacterModelId } from '../characterModels';
import { EffectComposer, ToneMapping, Bloom, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { GlacialValeTerrain } from '../world-art/GlacialValeTerrain';
import { GLACIAL_VALE } from '../../../../packages/content/terrain';
import { ValeHD } from './ValeHD';

const VALE_DAY_MS = 12 * 60 * 1000;

/**
 * PROTOTYPE (/showroom.html?scene=valeHD) — deedy's renderer (refraction +
 * exposure/ACES post) in our engine, our low camera, with a live FPS overlay.
 * Local feasibility/perf spike; NoToneMapping (the post does the tonemap).
 */
function ValeHDScene() {
  const params = new URLSearchParams(window.location.search);
  const num = (k: string, d: number) => { const v = Number(params.get(k)); return params.get(k) !== null && Number.isFinite(v) ? v : d; };
  const camPos: [number, number, number] = [num('cx', GLACIAL_VALE.x - 45), num('cy', 6), num('cz', GLACIAL_VALE.z + 45)];
  const target: [number, number, number] = [num('tx', GLACIAL_VALE.x), num('ty', 2), num('tz', GLACIAL_VALE.z)];
  const [fps, setFps] = useState(0);
  return (
    <>
      <Canvas
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping, outputColorSpace: THREE.LinearSRGBColorSpace }}
        camera={{ position: camPos, fov: 55, near: 0.1, far: 4000 }}
        onCreated={({ gl }) => { gl.setClearColor(new THREE.Color(0.5, 0.55, 0.72)); gl.setPixelRatio(Math.min(window.devicePixelRatio, 2)); }}
      >
        <Suspense fallback={null}>
          <ValeHD onFps={setFps} />
        </Suspense>
        <OrbitControls target={target} enableDamping />
      </Canvas>
      <div style={{ position: 'fixed', top: 8, left: 8, font: '600 14px ui-monospace,monospace', color: '#dff', background: 'rgba(0,0,0,0.55)', padding: '4px 9px', borderRadius: 6, pointerEvents: 'none' }}>
        {fps ? `${fps.toFixed(0)} fps` : 'baking…'}
      </div>
    </>
  );
}

/**
 * Glacial Vale preview — mounts the real ported vale terrain/water under the
 * game's WorldEnvironment, no backend. A local screenshot target so world-art /
 * shader changes can be iterated against `pnpm dev` instead of a full deploy.
 *
 *   /showroom.html?scene=vale&phase=0.35
 *   &cx,cy,cz = camera pos   &tx,ty,tz = orbit target
 *
 * `phase` pins the sun by freezing Date.now() (the day-phase clock) so shots
 * across edits are comparable; R3F's performance.now clock keeps animating the
 * water/clouds. Dev-only page, not linked from the game.
 */
function ValeScene() {
  const params = new URLSearchParams(window.location.search);
  const phase = Number(params.get('phase') ?? 0.35);
  // Pin the day-phase clock by freezing Date.now to a phase-derived timestamp,
  // restoring the real one on unmount (effect, not a side effect in render).
  // R3F's performance.now clock is untouched, so water/clouds keep animating.
  useLayoutEffect(() => {
    const real = Date.now;
    const base = Math.floor(real() / VALE_DAY_MS) * VALE_DAY_MS + phase * VALE_DAY_MS;
    Date.now = () => base;
    return () => { Date.now = real; };
  }, [phase]);

  const num = (k: string, d: number) => { const v = Number(params.get(k)); return Number.isFinite(v) && params.get(k) !== null ? v : d; };
  const focus = useMemo(() => ({ x: GLACIAL_VALE.x, y: 0, z: GLACIAL_VALE.z }), []);
  const camPos: [number, number, number] = [num('cx', GLACIAL_VALE.x - 45), num('cy', 11), num('cz', GLACIAL_VALE.z + 45)];
  const target: [number, number, number] = [num('tx', GLACIAL_VALE.x), num('ty', 1.5), num('tz', GLACIAL_VALE.z)];

  return (
    <Canvas
      shadows
      camera={{ position: camPos, fov: 55, near: 0.1, far: 4000 }}
      onCreated={({ gl }) => gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))}
    >
      <WorldEnvironment focus={focus} />
      <Suspense fallback={null}>
        <GlacialValeTerrain />
      </Suspense>
      <OrbitControls target={target} enableDamping />
      {/* Faithful to the game's ScenePostFX (bloom → ACES → grade) so the preview
          shows the same exposure/blowout the in-game vale gets. */}
      <EffectComposer enableNormalPass={false} multisampling={0}>
        <Bloom intensity={0.62} luminanceThreshold={0.62} luminanceSmoothing={0.16} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <HueSaturation hue={0} saturation={0.12} />
        <BrightnessContrast brightness={0} contrast={0.08} />
      </EffectComposer>
    </Canvas>
  );
}

/**
 * In-engine asset showroom — renders any registry model under the game's real
 * WorldEnvironment lighting (so it looks exactly as in-game) on a free orbit
 * camera with no HUD or combat. A reusable review tool and a clean screenshot
 * target. Standalone page (`showroom.html`); not linked from the game.
 *
 * URL params:
 *   ?anim=idle|walk|run|attack|death   animation state (default idle)
 *   ?only=<modelId>                    show a single model, centered
 *   ?cols=N                            grid columns (default 5)
 */

const ALL_MODELS = Object.keys(CHARACTER_MODELS) as CharacterModelId[];

// Family → model, so the label reads as the in-game family for the monster rigs.
const FAMILY_BY_MODEL: Partial<Record<CharacterModelId, string>> = (() => {
  const map: Partial<Record<CharacterModelId, string>> = {};
  for (const fam of ['beast', 'elemental', 'dragon', 'aberration', 'fey', 'spirit', 'plant', 'construct', 'undead', 'humanoid']) {
    map[enemyModel(fam)] = map[enemyModel(fam)] ? `${map[enemyModel(fam)]}/${fam}` : fam;
  }
  return map;
})();

const GROUND_GEO = new THREE.CircleGeometry(1.4, 40);
const FOCUS_ORIGIN = { x: 0, y: 0, z: 0 };
const CONTROLS_TARGET: [number, number, number] = [0, 1, 0];
const SPACING = 3.4;

function Pedestal({ modelId, state, label }: { modelId: CharacterModelId; state: CharacterAnim; label: string }) {
  return (
    <group>
      <mesh geometry={GROUND_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <meshStandardMaterial color="#2a3450" roughness={0.9} />
      </mesh>
      <Suspense fallback={null}>
        <AnimatedCharacter modelId={modelId} state={state} targetHeight={2} />
      </Suspense>
      <Html position={[0, -0.1, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
        <div style={{ font: '600 13px system-ui', color: '#dbe7ff', background: 'rgba(11,16,32,0.7)', padding: '2px 8px', borderRadius: 6, whiteSpace: 'pre', textAlign: 'center' }}>{label}</div>
      </Html>
    </group>
  );
}

export function Showroom() {
  // Pure router (no hooks of its own) so each scene keeps its hooks
  // unconditional — `?scene=vale` swaps the whole tree for the vale preview.
  const scene = new URLSearchParams(window.location.search).get('scene');
  if (scene === 'valeHD') return <ValeHDScene />;
  return scene === 'vale' ? <ValeScene /> : <ModelGrid />;
}

function ModelGrid() {
  const params = new URLSearchParams(window.location.search);
  const state = (params.get('anim') as CharacterAnim) || 'idle';
  const only = params.get('only') as CharacterModelId | null;
  const cols = Math.max(1, Number(params.get('cols') ?? 5));

  const models = useMemo(() => (only && CHARACTER_MODELS[only] ? [only] : ALL_MODELS), [only]);
  const placed = useMemo(() => {
    const rows = Math.ceil(models.length / cols);
    return models.map((id, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      return { id, x: (c - (Math.min(cols, models.length) - 1) / 2) * SPACING, z: (r - (rows - 1) / 2) * SPACING };
    });
  }, [models, cols]);
  const camDist = Math.max(7, cols * 2.4);

  return (
    <Canvas
      shadows
      camera={{ position: [0, camDist * 0.55, camDist], fov: 45, near: 0.1, far: 2000 }}
      onCreated={({ gl }) => gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))}
    >
      <WorldEnvironment focus={FOCUS_ORIGIN} />
      {/* Review fill so models read clearly regardless of the day-night phase. */}
      <hemisphereLight args={['#cfe0ff', '#2a3450', 1.1]} />
      <directionalLight position={[6, 10, 6]} intensity={1.4} />
      {/* Big neutral ground so models aren't floating in void. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#1b2438" roughness={1} />
      </mesh>
      {placed.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <Pedestal modelId={p.id} state={state} label={FAMILY_BY_MODEL[p.id] ? `${FAMILY_BY_MODEL[p.id]}\n(${p.id})` : p.id} />
        </group>
      ))}
      <OrbitControls target={CONTROLS_TARGET} enableDamping />
    </Canvas>
  );
}
