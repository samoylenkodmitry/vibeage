import { Sky } from '@react-three/drei';
import { CozyAtmosphere } from './CozyAtmosphere';
import { CozyAuthoredCoast } from './CozyAuthoredCoast';
import { CozyPineForest } from './CozyPineForest';
import { CozyShoreBand } from './CozyShoreBand';
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
 * Stack:
 *   Sky        — Drei's atmospheric sky shader
 *   Atmosphere — fog + warm sun + cool hemisphere fill
 *   Water      — stylized procedural plane, raycast-disabled
 *   Shore      — pale sand band along the waterline
 *   Foliage    — GLB pines/rocks/grass (PR 2). Falls back to PR 1
 *                procedural silhouettes if assets fail to load.
 *   AuthoredCoast — hand-placed dock/rowboat/bonfire (PR 4).
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
      <CozyAuthoredCoast scene={scene} />
      <CozyPineForest scene={scene} quality={quality} />
    </>
  );
}
