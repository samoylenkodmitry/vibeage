import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { CastMarker } from '../WorldEntities';
import { castAnchorsAtTarget } from '../SceneVfx';
import { FLYING_MECHANICS } from '../vfx/spellFx';
import { skillThemeFor } from '../vfx/skillThemeConfig';
import { CastState, type CastSnapshot } from '../../../../packages/protocol/common';

/**
 * Skill-VFX preview (`/showroom.html?scene=vfx`) — a grid of looping casts so
 * every spell's Casting → Traveling → Impact can be seen and compared side by
 * side while iterating on the effects. No backend: each cell synthesises a
 * CastSnapshot and drives it through the lifecycle, then renders the REAL
 * CastMarker (the in-game driver: SmoothedEntityGroup + CastVfx), under the
 * game's bloom/ACES post so it reads exactly as it does in the world.
 *
 * Cells sit near the world origin where getTerrainY()==0 (flat), so CastMarker's
 * ground sampling lands the effects on a level plane.
 */
type Cell = { skillId: string; label: string };

// One per distinct (element, mechanic) family + a few marquee skills, so the
// sameness is obvious at a glance and improvements are easy to compare.
const CELLS: Cell[] = [
  { skillId: 'fireball', label: 'Fireball (fire·arc)' },
  { skillId: 'iceBolt', label: 'Ice Bolt (ice·spiral)' },
  { skillId: 'arcane_blast', label: 'Arcane Blast (arcane·spiral)' },
  { skillId: 'poisonBlade', label: 'Poison Blade (poison·arc)' },
  { skillId: 'arrowShot', label: 'Arrow (phys·lance)' },
  { skillId: 'smite', label: 'Smite (holy·strike)' },
  { skillId: 'petrify', label: 'Petrify (stone·erupt)' },
  { skillId: 'waterSplash', label: 'Water Splash (water·deluge)' },
  { skillId: 'inferno_aura', label: 'Inferno (fire·nova)' },
  { skillId: 'meteor', label: 'Meteor (fire·strike)' },
  { skillId: 'holyLight', label: 'Holy Light (holy·strike)' },
  { skillId: 'time_sphere', label: 'Time Sphere' },
];

const COLS = 4;
const SPACING = 18;

const PHASE = { cast: 800, travel: 700, impact: 650, rest: 450 };
const CYCLE = PHASE.cast + PHASE.travel + PHASE.impact + PHASE.rest;

function cellPos(index: number): { x: number; z: number } {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const cols = Math.min(COLS, CELLS.length);
  return {
    x: (col - (cols - 1) / 2) * SPACING,
    z: (row - (Math.ceil(CELLS.length / COLS) - 1) / 2) * SPACING,
  };
}

function CastLoopCell({ cell, index, sync, at }: { cell: Cell; index: number; sync: boolean; at?: { x: number; z: number } }) {
  const base = useMemo(() => cellPos(index), [index]);
  const { x, z } = at ?? base;
  // DIAGONAL travel (caster → target) so a trajectory bug (a tail that ignores
  // the travel direction) is visible — a straight +Z path would hide it.
  const origin = useMemo(() => ({ x: x - 3.5, z: z - 3.5 }), [x, z]);
  const target = useMemo(() => ({ x: x + 3.5, z: z + 3.5 }), [x, z]);
  const dir = useMemo(() => {
    const dx = target.x - origin.x, dz = target.z - origin.z; const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }, [origin, target]);
  // FAITHFUL to the live game: only flying mechanics move snapshot.pos toward
  // the target; non-flying ones keep pos at the CASTER (the server never moves
  // it), so a target-delivered impact MUST come from the anchorPos path — the
  // same resolveCastAnchor(castAnchorsAtTarget) the world uses. The old preview
  // faked pos=target at impact and so hid the caster-vs-target anchoring bugs.
  const skillId = cell.skillId as CastSnapshot['skillId'];
  const flying = FLYING_MECHANICS.has(skillThemeFor(cell.skillId).mechanic ?? 'projectile');
  const anchorPos = castAnchorsAtTarget(skillId) ? target : undefined;
  const stagger = sync ? 0 : (index * 260) % CYCLE;
  const [snap, setSnap] = useState<CastSnapshot | null>(null);
  const acc = useRef(0);

  useFrame((state, dt) => {
    acc.current += dt;
    if (acc.current < 0.06) return; // ~16 Hz snapshot cadence (server-tick-ish)
    acc.current = 0;
    const ph = (state.clock.elapsedTime * 1000 + stagger) % CYCLE;
    const baseSnap = {
      castId: `preview-${cell.skillId}`,
      casterId: 'preview',
      skillId: cell.skillId as CastSnapshot['skillId'],
      origin, target, dir,
      startedAt: 0,
      castTimeMs: PHASE.cast,
    };
    let next: CastSnapshot | null;
    if (ph < PHASE.cast) {
      next = { ...baseSnap, state: CastState.Casting, pos: origin, progressMs: ph };
    } else if (ph < PHASE.cast + PHASE.travel) {
      const p = (ph - PHASE.cast) / PHASE.travel;
      const pos = flying ? { x: origin.x + (target.x - origin.x) * p, z: origin.z + (target.z - origin.z) * p } : origin;
      next = { ...baseSnap, state: CastState.Traveling, pos, progressMs: PHASE.cast };
    } else if (ph < PHASE.cast + PHASE.travel + PHASE.impact) {
      next = { ...baseSnap, state: CastState.Impact, pos: flying ? target : origin, progressMs: PHASE.cast };
    } else {
      next = null; // rest gap so each cycle reads as a fresh cast
    }
    setSnap(next);
  });

  return (
    <group>
      <Html position={[x, 0.05, z + 7]} center distanceFactor={26} occlude={false}>
        <div style={{ color: '#e2e8f0', font: '600 13px system-ui', whiteSpace: 'nowrap', textShadow: '0 1px 3px #000', pointerEvents: 'none' }}>{cell.label}</div>
      </Html>
      {/* caster (grey dot) + target (grey ring) markers so anchoring is visible */}
      <mesh position={[origin.x, -0.8, origin.z]}><sphereGeometry args={[0.16, 8, 8]} /><meshBasicMaterial color="#64748b" /></mesh>
      <mesh position={[target.x, -0.92, target.z]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.55, 0.7, 28]} /><meshBasicMaterial color="#94a3b8" transparent opacity={0.7} side={THREE.DoubleSide} /></mesh>
      {snap && <CastMarker cast={{ snapshot: snap, seenAt: 0 }} anchorPos={anchorPos} />}
    </group>
  );
}

export function VfxScene() {
  const params = new URLSearchParams(window.location.search);
  const sync = params.has('sync');
  // ?solo=<skillId> — one effect at origin, camera close, to inspect the shader
  // detail (the grid framing is too far to read turbulence/runes/iridescence).
  const solo = params.get('solo');
  const soloCell = solo ? CELLS.find((c) => c.skillId === solo) : undefined;
  // Stable refs (mode is fixed for the session — chosen from the URL at mount,
  // never switched at runtime, so the Canvas init camera is always correct).
  const isSolo = Boolean(soloCell);
  // Solo: a 3/4 side view so the projectile's travel (along the cell's +Z) and
  // its trail read from the side, not down the barrel.
  const camera = useMemo<[number, number, number]>(() => (isSolo ? [8, 5, 7] : [0, 42, 54]), [isSolo]);
  const target = useMemo<[number, number, number]>(() => (isSolo ? [0, 2.5, 0] : [0, 1.5, 0]), [isSolo]);
  return (
    <Canvas
      camera={{ position: camera, fov: soloCell ? 42 : 48, near: 0.1, far: 500 }}
      onCreated={({ gl }) => gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))}
    >
      <color attach="background" args={[0.04, 0.05, 0.08]} />
      {/* Soft fill so the non-additive form silhouettes read; additive cores/
          impacts supply their own light. */}
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#8090b0', '#202028', 0.6]} />
      <directionalLight position={[10, 20, 8]} intensity={0.7} />
      {/* Dark matte floor so additive VFX pop. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.95, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#15171d" roughness={1} metalness={0} />
      </mesh>
      {soloCell ? (
        <CastLoopCell key={soloCell.skillId} cell={soloCell} index={0} sync at={{ x: 0, z: 0 }} />
      ) : (
        CELLS.map((cell, index) => (
          <CastLoopCell key={cell.skillId} cell={cell} index={index} sync={sync} />
        ))
      )}
      <OrbitControls target={target} enableDamping />
      <EffectComposer enableNormalPass={false} multisampling={0}>
        <Bloom intensity={0.7} luminanceThreshold={0.5} luminanceSmoothing={0.16} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <HueSaturation hue={0} saturation={0.12} />
        <BrightnessContrast brightness={0} contrast={0.08} />
      </EffectComposer>
    </Canvas>
  );
}
