import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';

/**
 * FractalBurst — a localised swirling energy orb that captures the "absolutely
 * amazing" reference aesthetic (flowing, iridescent, intricate filaments) but,
 * unlike the raymarched folding fractal (gorgeous fullscreen, yet sparse and
 * off-centre on a small billboard), is built CENTRED and SYMMETRIC so it reads
 * as a cohesive orb at skill scale: a polar vortex domain-warped by fbm
 * turbulence, an iridescent exp(cos) palette (the reference's trick) pulled
 * toward the element, and a hot core with a clean radial fade.
 *
 * Camera-facing billboard. Cheaper than a per-pixel raymarch (2D fbm, ~5 octaves)
 * so it can run a tier lower, but callers still gate it to the richer tiers.
 * One shared GL program (module-level GLSL); per-instance material disposed on
 * unmount; uTime drives the churn, uAlpha lets a caller ramp/decay it.
 */
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uSwirl; // angular flow-speed multiplier (ramps as it charges)
  varying vec2 vUv;

  // Sine-less hash — a large-multiplier sin() loses precision on mobile mediump
  // GPUs (blocky/banded noise); this stays stable across platforms.
  float hash(vec2 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * (p.x + p.y));
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float f = 0.0, a = 0.5;
    for (int k = 0; k < 5; k++) { f += a * noise(p); p = p * 2.0 + 1.3; a *= 0.5; }
    return f;
  }

  void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    float r = length(uv);
    float ang = atan(uv.y, uv.x);
    // Vortex: angle winds up faster toward the core; the whole field drifts. The
    // flow speed scales with uSwirl so the storm can visibly spin UP as it charges.
    float swirl = ang + 1.7 / (r + 0.18) - uTime * 1.1 * uSwirl;
    vec2 q = vec2(swirl, r * 3.0 - uTime * 0.7 * uSwirl);
    // Domain-warped turbulence → flowing, branching filaments. A finer second
    // band adds crisp sub-detail so the ribbons don't read as a soft blur.
    float w = fbm(q + fbm(q * 1.4));
    float fil = pow(0.5 + 0.5 * sin(w * 6.2832 + r * 6.0 - uTime * 2.0 * uSwirl), 2.2);
    fil *= 0.62 + 0.38 * pow(0.5 + 0.5 * sin(w * 13.0 - uTime * 3.3), 2.0);
    // Iridescent palette (the reference's exp(cos) trick), pulled to the element.
    vec3 irid = exp(cos(w * 3.0 + r * 3.5 - vec3(0.0, 1.0, 2.0))) * 0.4;
    vec3 col = mix(irid, uColor, 0.38);
    // Bright filaments fading radially + a hot element core + a white-hot spark.
    float energy = fil * smoothstep(1.0, 0.12, r);
    float coreHot = smoothstep(0.42, 0.0, r);
    col = col * energy * 1.8 + uColor * coreHot * 0.95 + vec3(1.0) * smoothstep(0.13, 0.0, r) * 0.7;
    float a = clamp(energy + coreHot * 0.95, 0.0, 1.0);
    float edge = smoothstep(1.0, 0.82, r); // kill the square corners
    gl_FragColor = vec4(col, a * edge * uAlpha);
  }
`;

/**
 * Camera-facing swirling energy disc, tinted to `color`. Always faces the camera
 * (never edge-on, so it stays readable from the game's 3/4 view) but visibly
 * SPINS in its own plane — like looking into the eye of a hurricane.
 *
 * All animation hooks are read per-frame so a caller can drive a whole
 * cast→impact lifecycle (grow, spin up, flare, decay) without re-rendering React:
 *  - `getAlpha`     0..1 opacity (default 1)
 *  - `getSpinRate`  disc spin in rad/s (default 0.9; accelerate it to "spin up")
 *  - `getSwirl`     internal flow-speed multiplier (default 1; >1 = faster churn)
 */
export function FractalBurst({ color, size = 2.4, getAlpha, getSpinRate, getSwirl }: {
  color: string; size?: number; getAlpha?: () => number; getSpinRate?: () => number; getSwirl?: () => number;
}) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: Math.random() * 10 }, uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 }, uSwirl: { value: 1 } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);
  const meshRef = useRef<THREE.Mesh>(null);
  useEffect(() => { mat.uniforms.uColor.value.set(color); }, [color, mat]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
    if (getAlpha) mat.uniforms.uAlpha.value = getAlpha();
    if (getSwirl) mat.uniforms.uSwirl.value = getSwirl();
    if (meshRef.current) meshRef.current.rotation.z += dt * (getSpinRate ? getSpinRate() : 0.9);
  });
  return (
    <Billboard>
      <mesh ref={meshRef} material={mat}><planeGeometry args={[size, size]} /></mesh>
    </Billboard>
  );
}
