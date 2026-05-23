import { Sky } from '@react-three/drei';
import { CozyAtmosphere } from './CozyAtmosphere';
import { CozyShoreBand } from './CozyShoreBand';
import { CozyStarterPines } from './CozyStarterPines';
import { SimpleStylizedWater } from './SimpleStylizedWater';
import type { WorldArtQuality } from './quality';
import { pickActiveScene } from './worldArtScenes';

/**
 * Top-level cozy-coast layer. Owns sky, atmosphere, water, shore,
 * and the starter-area tree silhouettes. Mounted unconditionally
 * by `WorldScene`; the internal `pickActiveScene` decides whether
 * the cozy hero scene is active for the current player position.
 * When the player is outside every registered scene we render
 * nothing here — the existing `WorldEnvironment` stays the
 * fallback presentation for the rest of the world.
 *
 * PR 1 keeps the stack simple:
 *   Sky      — Drei's atmospheric sky shader
 *   Atmosphere — fog + warm sun + cool hemisphere fill
 *   Water    — stylized procedural plane, raycast-disabled
 *   Shore    — pale sand band along the waterline
 *   Pines    — instanced procedural silhouettes (real GLB in PR 2)
 */
type Focus = { x: number; y?: number; z: number };

export function CozyWorldArt({ focus, quality }: { focus: Focus; quality: WorldArtQuality }) {
  const scene = pickActiveScene(focus.x, focus.z);
  if (!scene) return null;
  return (
    <>
      <CozyAtmosphere focus={focus} quality={quality} />
      <Sky
        distance={4500}
        sunPosition={[400, 220, 280]}
        turbidity={6}
        rayleigh={2.2}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />
      <SimpleStylizedWater scene={scene} />
      <CozyShoreBand scene={scene} />
      <CozyStarterPines scene={scene} quality={quality} />
    </>
  );
}
