import { CozyAuthoredCoast } from './CozyAuthoredCoast';
import { CozyBonfireGlow } from './CozyBonfireGlow';
import { CozyBonfireSmoke } from './CozyBonfireSmoke';
import { CozyDistantMountains } from './CozyDistantMountains';
import { CozyDriftwood } from './CozyDriftwood';
import { CozyFireflies } from './CozyFireflies';
import { CozyFireStones } from './CozyFireStones';
import { CozyLanterns } from './CozyLanterns';
import { CozyPetals } from './CozyPetals';
import { CozyPineForest } from './CozyPineForest';
import { CozyShells } from './CozyShells';
import { CozyShoreBand } from './CozyShoreBand';
import { CozyShoreFoam } from './CozyShoreFoam';
import { CozyWaterLilies } from './CozyWaterLilies';
import { CozyWaterSparkles } from './CozyWaterSparkles';
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
 *   DistantMountains — low-poly silhouette ring on the horizon
 *   Water            — stylized procedural plane, raycast-disabled
 *   Shore            — pale sand band along the waterline
 *   ShoreFoam        — animated foam crests at the water edge
 *   AuthoredCoast    — hand-placed dock/rowboat/bonfire
 *   BonfireGlow      — warm flickering pointLight at each bonfire
 *   BonfireSmoke     — drifting smoke column above each bonfire
 *   Lanterns         — small flickering pointLight at each lantern
 *   Foliage          — GLB pines/rocks/grass with procedural fallback
 */

export function CozyWorldArt({
  scene, quality,
}: {
  scene: WorldArtScene;
  quality: WorldArtQuality;
}) {
  return (
    <>
      <CozyDistantMountains scene={scene} />
      <SimpleStylizedWater scene={scene} />
      <CozyWaterLilies scene={scene} />
      <CozyWaterSparkles scene={scene} />
      <CozyShoreBand scene={scene} />
      <CozyShoreFoam scene={scene} />
      <CozyDriftwood scene={scene} />
      <CozyShells scene={scene} />
      <CozyAuthoredCoast scene={scene} />
      <CozyFireStones scene={scene} />
      <CozyBonfireGlow scene={scene} />
      <CozyBonfireSmoke scene={scene} />
      <CozyLanterns scene={scene} />
      <CozyFireflies scene={scene} />
      <CozyPetals scene={scene} />
      <CozyPineForest scene={scene} quality={quality} />
    </>
  );
}
