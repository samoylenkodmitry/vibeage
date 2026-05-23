import { Sky } from '@react-three/drei';
import { CozyAtmosphere } from './CozyAtmosphere';
import { CozyAuthoredCoast } from './CozyAuthoredCoast';
import { CozyPineForest } from './CozyPineForest';
import { CozyShoreBand } from './CozyShoreBand';
import { SimpleStylizedWater } from './SimpleStylizedWater';
import type { WorldArtQuality } from './quality';
import { pickActiveScene } from './worldArtScenes';

/**
 * Cozy world-art layer.
 *
 * Two tiers of presentation:
 *
 * 1. **Global atmosphere** — `CozyAtmosphere` (sky color / fog /
 *    sun / hemisphere fill) and Drei `<Sky>` are mounted
 *    unconditionally so the whole world reads under one cozy
 *    palette. The PR 1 design hard-cut between zones (cozy
 *    inside / `<color attach="background">` outside) made the
 *    declarative background fight `CozyAtmosphere`'s imperative
 *    `scene.background` writes — outside the cozy radius the
 *    sky reverted to the renderer's default (white). Hoisting
 *    fixes that and removes the jarring zone transition.
 *
 * 2. **Anchored hero scene** — water, shore band, authored
 *    dock/rowboat/bonfire, and GLB foliage scatter only render
 *    when `pickActiveScene(focus)` resolves to a registered
 *    scene. Other zones get the atmosphere but not the coast
 *    geography — water doesn't follow the player around.
 */
type Focus = { x: number; y?: number; z: number };

export function CozyWorldArt({
  focus, quality, cozyActive,
}: {
  focus: Focus;
  quality: WorldArtQuality;
  cozyActive: boolean;
}) {
  const scene = pickActiveScene(focus.x, focus.z);
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
      {cozyActive && scene && (
        <>
          <SimpleStylizedWater scene={scene} />
          <CozyShoreBand scene={scene} />
          <CozyAuthoredCoast scene={scene} />
          <CozyPineForest scene={scene} quality={quality} />
        </>
      )}
    </>
  );
}
