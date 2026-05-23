import { CozyAuthoredCoast } from './CozyAuthoredCoast';
import { CozyBonfireGlow } from './CozyBonfireGlow';
import { CozyLanterns } from './CozyLanterns';
import { CozyPineForest } from './CozyPineForest';
import { CozyShoreBand } from './CozyShoreBand';
import { SimpleStylizedWater } from './SimpleStylizedWater';
import type { WorldArtQuality } from './quality';
import type { WorldArtScene } from './worldArtScenes';

/**
 * Cozy hero-scene presentation. Mounted only when the player is
 * inside a registered scene radius (`pickActiveScene` resolves to
 * a non-null scene in `WorldScene`).
 *
 * Atmosphere is intentionally NOT owned here. `WorldEnvironment`
 * already paints a dramatic day/night sky (sun, moon, clouds,
 * palette in `computeDayPhase`) that the user prefers across the
 * whole world — including inside cozy scenes. The cozy layer
 * only contributes anchored geometry on top of that.
 *
 * Stack:
 *   Water         — stylized procedural plane, raycast-disabled
 *   Shore         — pale sand band along the waterline
 *   AuthoredCoast — hand-placed dock/rowboat/bonfire
 *   BonfireGlow   — warm flickering pointLight at each bonfire
 *   Lanterns      — small flickering pointLight at each lantern
 *   Foliage       — GLB pines/rocks/grass with procedural fallback
 */

export function CozyWorldArt({
  scene, quality,
}: {
  scene: WorldArtScene;
  quality: WorldArtQuality;
}) {
  return (
    <>
      <SimpleStylizedWater scene={scene} />
      <CozyShoreBand scene={scene} />
      <CozyAuthoredCoast scene={scene} />
      <CozyBonfireGlow scene={scene} />
      <CozyLanterns scene={scene} />
      <CozyPineForest scene={scene} quality={quality} />
    </>
  );
}
