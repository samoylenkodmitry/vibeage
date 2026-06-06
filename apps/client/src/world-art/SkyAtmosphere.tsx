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
 * cycle for free.
 *
 * EXPOSURE: this Sky outputs raw HDR radiance and relies on the renderer's tone
 * mapping (`#include <tonemapping_fragment>`), but the post-processing
 * EffectComposer disables renderer tone mapping — so the horizon band (where the
 * in-scattering `Lin` is enormous) clipped to pure WHITE, and a global tone-map
 * can't recover it (Reinhard sends huge values asymptotically to white; only the
 * deep zenith stayed blue). We give the Sky its OWN exposure + Reinhard highlight
 * compression in the shader: the bright horizon reads as colour while the zenith
 * blue is preserved, and the scene's adaptive tone-map then only has well-ranged
 * sky to work with.
 *
 * Rendered as a big box around the player (depthWrite off, renderOrder far
 * negative) so it sits behind everything; scene.background/fog stay as the
 * fallback that WorldEnvironment owns, and the sun disc / moon / stars compose
 * on top.
 */
const SKY_EXPOSURE = 0.32;

function makeSky(): Sky {
  const s = new Sky();
  s.scale.setScalar(8000); // inside cameraFar (9000), re-centred on the player each frame
  s.renderOrder = -10000;
  const mat = s.material as THREE.ShaderMaterial;
  const u = mat.uniforms;
  u.turbidity.value = 2.4;        // low haze → less white horizon
  u.rayleigh.value = 2.6;         // strong sky blue
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.86; // tight, warm sun glow
  // Self tone-map: scale by exposure then Reinhard-compress so the very bright
  // horizon doesn't blow out (the renderer's tone map is disabled downstream).
  u.skyExposure = { value: SKY_EXPOSURE };
  mat.fragmentShader = 'uniform float skyExposure;\n' + mat.fragmentShader.replace(
    'gl_FragColor = vec4( texColor, 1.0 );',
    'vec3 _sky = texColor * skyExposure; _sky = _sky / ( 1.0 + _sky ); gl_FragColor = vec4( _sky, 1.0 );',
  );
  mat.depthWrite = false;
  return s;
}

export function SkyAtmosphere({ focus, palette }: { focus: { x: number; y: number; z: number }; palette: MutableRefObject<DayPhasePalette> }) {
  const sky = useMemo(() => makeSky(), []);

  useEffect(() => () => {
    sky.geometry.dispose();
    if (Array.isArray(sky.material)) sky.material.forEach((m) => m.dispose());
    else sky.material.dispose();
  }, [sky]);

  useFrame(() => {
    const p = palette.current;
    sky.position.set(focus.x, focus.y, focus.z);
    // sunPosition is a direction (the shader normalises it). sunDir.y < 0 at
    // night → the scattering goes dark, matching the day/night cycle.
    (sky.material as THREE.ShaderMaterial).uniforms.sunPosition.value.set(p.sunDir.x, p.sunDir.y, p.sunDir.z);
  });

  return <primitive object={sky} />;
}
