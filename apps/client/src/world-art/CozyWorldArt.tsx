import { CozyAuthoredCoast } from './CozyAuthoredCoast';
import { CozyBonfireEmbers } from './CozyBonfireEmbers';
import { CozyBonfireFlame } from './CozyBonfireFlame';
import { CozyBuoys } from './CozyBuoys';
import { CozyButterflies } from './CozyButterflies';
import { CozyBonfireGlow } from './CozyBonfireGlow';
import { CozyBonfireSmoke } from './CozyBonfireSmoke';
import { CozyDriftwood } from './CozyDriftwood';
import { CozyFireflies } from './CozyFireflies';
import { CozyFireStones } from './CozyFireStones';
import { CozyFirewoodStack } from './CozyFirewoodStack';
import { CozyFishingRods } from './CozyFishingRods';
import { CozyLanterns } from './CozyLanterns';
import { CozyLogBench } from './CozyLogBench';
import { CozyMushrooms } from './CozyMushrooms';
import { CozyPetals } from './CozyPetals';
import { CozyPineCones } from './CozyPineCones';
import { CozySeagulls } from './CozySeagulls';
import { CozyShells } from './CozyShells';
import { CozyShoreBand } from './CozyShoreBand';
import { CozyShoreFoam } from './CozyShoreFoam';
import { CozyWaterLilies } from './CozyWaterLilies';
import { CozyWaterRipples } from './CozyWaterRipples';
import { CozyWaterSparkles } from './CozyWaterSparkles';
import { CozyWildflowers } from './CozyWildflowers';
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
 *   Water            — stylized procedural plane, raycast-disabled
 *   Shore            — pale sand band along the waterline
 *   ShoreFoam        — animated foam crests at the water edge
 *   AuthoredCoast    — hand-placed dock/rowboat/bonfire
 *   BonfireGlow      — warm flickering pointLight at each bonfire
 *   BonfireSmoke     — drifting smoke column above each bonfire
 *   Lanterns         — small flickering pointLight at each lantern
 *
 * The distant-mountain horizon ring and the GLB pine forest used to live here
 * too; both were lifted out — the horizon ring is now WorldHorizonMountains
 * (follows focus, world-wide) and the trees are now the global WorldFoliage,
 * so there's no duplicate foliage layer and no tree/horizon boundary at the
 * cozy-coast radius.
 */

export function CozyWorldArt({ scene }: { scene: WorldArtScene }) {
  return (
    <>
      {/* Water plane was here; hoisted to WorldScene so the sea
          stays visible from anywhere inland. */}
      <CozyWaterLilies scene={scene} />
      <CozyWaterRipples scene={scene} />
      <CozyBuoys scene={scene} />
      <CozyWaterSparkles scene={scene} />
      <CozyShoreBand scene={scene} />
      <CozyShoreFoam scene={scene} />
      <CozyDriftwood scene={scene} />
      <CozyShells scene={scene} />
      <CozyAuthoredCoast scene={scene} />
      <CozyFishingRods scene={scene} />
      <CozyFireStones scene={scene} />
      <CozyFirewoodStack scene={scene} />
      <CozyLogBench scene={scene} />
      <CozyBonfireFlame scene={scene} />
      <CozyBonfireEmbers scene={scene} />
      <CozyBonfireGlow scene={scene} />
      <CozyBonfireSmoke scene={scene} />
      <CozyLanterns scene={scene} />
      <CozyFireflies scene={scene} />
      <CozyButterflies scene={scene} />
      <CozyMushrooms scene={scene} />
      <CozyPineCones scene={scene} />
      <CozyWildflowers scene={scene} />
      <CozySeagulls scene={scene} />
      <CozyPetals scene={scene} />
    </>
  );
}
