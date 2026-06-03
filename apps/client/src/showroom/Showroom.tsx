import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { WorldEnvironment } from '../WorldEnvironment';
import { AnimatedCharacter } from '../AnimatedCharacter';
import { CHARACTER_MODELS, enemyModel, type CharacterAnim, type CharacterModelId } from '../characterModels';

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
  const params = new URLSearchParams(window.location.search);
  const state = (params.get('anim') as CharacterAnim) || 'idle';
  const only = params.get('only') as CharacterModelId | null;
  const cols = Math.max(1, Number(params.get('cols') ?? 5));

  const models = useMemo(() => (only && CHARACTER_MODELS[only] ? [only] : ALL_MODELS), [only]);
  const spacing = 3.4;
  const rows = Math.ceil(models.length / cols);
  const placed = models.map((id, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    return { id, x: (c - (Math.min(cols, models.length) - 1) / 2) * spacing, z: (r - (rows - 1) / 2) * spacing };
  });
  const camDist = Math.max(7, cols * 2.4);

  return (
    <Canvas
      shadows
      camera={{ position: [0, camDist * 0.55, camDist], fov: 45, near: 0.1, far: 2000 }}
      onCreated={({ gl }) => gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))}
    >
      <WorldEnvironment focus={{ x: 0, y: 0, z: 0 }} />
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
      <OrbitControls target={[0, 1, 0]} enableDamping />
    </Canvas>
  );
}
