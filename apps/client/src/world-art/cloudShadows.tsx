import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { computeDayPhase } from '../timeOfDay';

/**
 * Drifting cloud shadows — a world-anchored two-octave value noise darkens
 * patches of ground that slide with a steady wind. The SAME formula runs in
 * three places (terrain chunks, the horizon shell, the grass shader) off the
 * SAME shared uniforms, so a shadow patch lines up across all of them.
 *
 * Gated by sun elevation (uCloudStrength → 0 at night: moonlight cloud
 * shadows would read as artefacts) and kept subtle — at full strength a
 * cloud core darkens to ~0.78.
 */
export const CLOUD_UNIFORMS = {
  uCloudTime: { value: 0 },
  uCloudStrength: { value: 0 },
};

/** GLSL — expects `uCloudTime`/`uCloudStrength` uniforms and a `chash`/`cnoise`
 *  pair; world is the XZ world position. Returns a multiplier 0.78..1.0. */
export const CLOUD_GLSL = /* glsl */ `
  float chash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float cnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(chash(i),chash(i+vec2(1.0,0.0)),f.x),
               mix(chash(i+vec2(0.0,1.0)),chash(i+vec2(1.0,1.0)),f.x), f.y); }
  float cloudShadow(vec2 world){
    vec2 cp = (world + vec2(uCloudTime*9.0, uCloudTime*3.5)) * 0.0055;
    float c = cnoise(cp)*0.65 + cnoise(cp*2.7)*0.35;
    return 1.0 - smoothstep(0.55, 0.82, c) * 0.22 * uCloudStrength;
  }
`;

/** Patch a MeshStandardMaterial so its output is modulated by the cloud
 *  field. Per-vertex (terrain verts are ≤11 m apart; clouds are ~180 m) —
 *  smooth, and the fragment cost is one varying multiply. */
export function patchMaterialWithCloudShadow(material: THREE.Material): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCloudTime = CLOUD_UNIFORMS.uCloudTime;
    shader.uniforms.uCloudStrength = CLOUD_UNIFORMS.uCloudStrength;
    shader.vertexShader = `
      uniform float uCloudTime;
      uniform float uCloudStrength;
      varying float vCloudShadow;
      ${CLOUD_GLSL}
    ` + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec4 _cloudWorld = modelMatrix * vec4(transformed, 1.0);
       vCloudShadow = cloudShadow(_cloudWorld.xz);`,
    );
    shader.fragmentShader = 'varying float vCloudShadow;\n' + shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `gl_FragColor.rgb *= vCloudShadow;
       #include <dithering_fragment>`,
    );
  };
  material.needsUpdate = true;
}

/** Drives the shared cloud uniforms once per frame (mount once). */
export function CloudShadowDriver() {
  useFrame(({ clock }) => {
    CLOUD_UNIFORMS.uCloudTime.value = clock.elapsedTime;
    // Fade the whole effect with sun elevation — recomputed cheaply; the
    // palette interpolation is the same 4 Hz-class cost as the water tints.
    const sunY = computeDayPhase(Date.now()).sunDir.y;
    CLOUD_UNIFORMS.uCloudStrength.value = Math.min(1, Math.max(0, (sunY - 0.05) / 0.15));
  });
  return null;
}
