import { useEffect, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { DayPhasePalette } from '../timeOfDay';

/**
 * Atmospheric sky — three.js' Rayleigh/Mie scattering Sky, driven by the
 * day-phase sun direction. Gives a vivid blue daytime sky, warm scattering at
 * the horizon through dawn/dusk, and a dark sky once the sun drops below the
 * horizon — all from the sun elevation, so it tracks the existing day/night
 * cycle for free. Replaces the flat-gradient dome (which read washed-out at
 * midday).
 *
 * Rendered as a big box around the player (depthWrite off, renderOrder far
 * negative) so it sits behind everything; scene.background/fog stay as the
 * fallback that WorldEnvironment owns, and the sun disc / moon / stars compose
 * on top as before. ACES tone mapping (R3F default) keeps the HDR sky in range.
 */
export function SkyAtmosphere({ focus, palette }: { focus: { x: number; y: number; z: number }; palette: MutableRefObject<DayPhasePalette> }) {
  const sky = useMemo(() => {
    const s = new Sky();
    s.scale.setScalar(8000); // inside cameraFar (9000), re-centred on the player each frame
    s.renderOrder = -10000;
    const u = s.material.uniforms;
    u.turbidity.value = 3.4;        // low haze → clean, vivid day
    u.rayleigh.value = 2.6;         // strong sky blue
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.86; // tight, warm sun glow
    s.material.depthWrite = false;
    return s;
  }, []);

  useEffect(() => () => sky.geometry.dispose(), [sky]);
  useEffect(() => () => (sky.material as THREE.Material).dispose(), [sky]);

  useFrame(() => {
    const p = palette.current;
    sky.position.set(focus.x, focus.y, focus.z);
    // sunPosition is a direction (the shader normalises it). sunDir.y < 0 at
    // night → the scattering goes dark, matching the day/night cycle.
    sky.material.uniforms.sunPosition.value.set(p.sunDir.x, p.sunDir.y, p.sunDir.z);
  });

  return <primitive object={sky} />;
}
