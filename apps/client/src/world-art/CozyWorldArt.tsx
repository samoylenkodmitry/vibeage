import { Sky } from '@react-three/drei';
import { CozyAtmosphere } from './CozyAtmosphere';
import { CozyAuthoredCoast } from './CozyAuthoredCoast';
import { CozyPineForest } from './CozyPineForest';
import { CozyShoreBand } from './CozyShoreBand';
import { SimpleStylizedWater } from './SimpleStylizedWater';
import type { WorldArtQuality } from './quality';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Cozy hero-scene presentation. Mounted only when the player is
 * inside a registered scene radius (`pickActiveScene` resolves to
 * a non-null scene in `WorldScene`). When the component unmounts
 * `CozyAtmosphere` hands `scene.background`/`scene.fog` back as
 * valid objects so `WorldEnvironment`'s day/night useFrame can
 * keep mutating them — that handoff is what fixes the "bleak
 * white sky" regression after leaving the cozy zone.
 *
 * Stack:
 *   Atmosphere   — sky color + fog + sun + hemisphere fill
 *   Sky          — Drei atmospheric sky shader
 *   Water        — stylized procedural plane, raycast-disabled
 *   Shore        — pale sand band along the waterline
 *   AuthoredCoast — hand-placed dock/rowboat/bonfire
 *   Foliage      — GLB pines/rocks/grass with procedural fallback
 */
type Focus = { x: number; y?: number; z: number };

export function CozyWorldArt({
  focus, quality, scene,
}: {
  focus: Focus;
  quality: WorldArtQuality;
  scene: WorldArtScene;
}) {
  return (
    <>
      <CozyAtmosphere focus={focus} quality={quality} />
      {/*
       * Sky parameters tuned for a saturated late-afternoon look.
       * Earlier (turbidity=6, rayleigh=2.2, high sun) the shader
       * read as bleached high-noon white. Lower turbidity drops
       * the haze, higher rayleigh pushes blue, and a lower /
       * closer sun produces a warm horizon band that matches the
       * cozy reference imagery.
       */}
      <Sky
        distance={4500}
        sunPosition={[220, 90, 320]}
        turbidity={2.6}
        rayleigh={3.0}
        mieCoefficient={0.005}
        mieDirectionalG={0.86}
      />
      <SimpleStylizedWater scene={scene} />
      <CozyShoreBand scene={scene} />
      <CozyAuthoredCoast scene={scene} />
      <CozyPineForest scene={scene} quality={quality} />
    </>
  );
}
