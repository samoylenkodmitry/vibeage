import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Reusable shader-driven spell visuals. The GLSL source is module-level, so
 * every ShaderMaterial built from it shares ONE compiled GL program (three's
 * program cache keys on source) — no per-cast shader recompile / frame hitch.
 * Materials are per-instance (own uniforms) but cheap; disposed on unmount.
 *
 *  - EnergyOrb     : fresnel-rimmed, pulsing energy core (cast / projectile).
 *  - GroundShockwave: an expanding ring of light on the floor (impact).
 */

const ORB_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const ORB_FRAG = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uGlow;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float fres = pow(1.0 - clamp(dot(vNormal, vViewDir), 0.0, 1.0), 2.4);
    float pulse = 0.82 + 0.18 * sin(uTime * 9.0);
    vec3 col = mix(uCore, uGlow, fres) * pulse;
    float a = clamp(0.5 + fres * 0.6, 0.0, 1.0) * pulse;
    gl_FragColor = vec4(col, a);
  }
`;

const SHOCK_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SHOCK_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform float uProgress; // 0 → 1 over the impact lifetime
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0; // 0 centre .. 1 edge
    float ring = smoothstep(0.11, 0.0, abs(d - uProgress));   // bright expanding rim
    float core = smoothstep(0.45, 0.0, d) * (1.0 - smoothstep(0.0, 0.4, uProgress)); // early flash
    float fade = 1.0 - smoothstep(0.55, 1.0, uProgress);
    // step(d,1.0) clips to the disc without discard (keeps early-Z on tiled GPUs).
    float a = (ring + core * 0.5) * fade * step(d, 1.0);
    vec3 col = mix(uColor, uAccent, ring);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

function makeOrbMaterial(core: string, glow: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uCore: { value: new THREE.Color(core) }, uGlow: { value: new THREE.Color(glow) }, uTime: { value: 0 } },
    vertexShader: ORB_VERT,
    fragmentShader: ORB_FRAG,
    transparent: true,
    depthWrite: false,
  });
}

function makeShockMaterial(color: string, accent: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAccent: { value: new THREE.Color(accent) }, uProgress: { value: 0 } },
    vertexShader: SHOCK_VERT,
    fragmentShader: SHOCK_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide, // ground plane is only seen from above
    blending: THREE.AdditiveBlending,
  });
}

export function EnergyOrb({ core, glow, radius = 0.4, spin = 2.5 }: { core: string; glow: string; radius?: number; spin?: number }) {
  // Build the material once; update colour uniforms in place so a theme change
  // never recreates/recompiles the material.
  const mat = useMemo(() => makeOrbMaterial('#ffffff', '#ffffff'), []);
  useEffect(() => {
    mat.uniforms.uCore.value.set(core);
    mat.uniforms.uGlow.value.set(glow);
  }, [core, glow, mat]);
  useEffect(() => () => mat.dispose(), [mat]);
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
    const m = meshRef.current;
    if (m && spin) { m.rotation.y += dt * spin; m.rotation.x += dt * spin * 0.6; }
  });
  return (
    <mesh ref={meshRef} material={mat}>
      <icosahedronGeometry args={[radius, 3]} />
    </mesh>
  );
}

// ---- Element-specific cores ----------------------------------------------

export type SpellElement = 'fire' | 'ice' | 'holy' | 'poison' | 'arcane';

/** Compact 3D value-noise + fbm (shared GLSL prepended to fire shaders). */
const NOISE_GLSL = /* glsl */ `
  float vhash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(vhash(i + vec3(0.,0.,0.)), vhash(i + vec3(1.,0.,0.)), f.x),
                   mix(vhash(i + vec3(0.,1.,0.)), vhash(i + vec3(1.,1.,0.)), f.x), f.y),
               mix(mix(vhash(i + vec3(0.,0.,1.)), vhash(i + vec3(1.,0.,1.)), f.x),
                   mix(vhash(i + vec3(0.,1.,1.)), vhash(i + vec3(1.,1.,1.)), f.x), f.y), f.z);
  }
  float fbm(vec3 p){ float a = 0.5, v = 0.0; for (int i = 0; i < 4; i++){ v += a * vnoise(p); p *= 2.02; a *= 0.5; } return v; }
`;

const CORE_VERT = /* glsl */ `
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vViewDir;
  void main() {
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FIRE_FRAG = NOISE_GLSL + /* glsl */ `
  uniform float uTime;
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vViewDir;
  void main() {
    vec3 p = vPos * 2.6; p.y -= uTime * 1.7;        // flames flow upward
    float n = fbm(p);
    float fres = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 1.5);
    float heat = clamp(n * 1.25 + (1.0 - fres) * 0.35, 0.0, 1.0);
    vec3 col = mix(vec3(0.70,0.10,0.0), vec3(1.0,0.46,0.05), smoothstep(0.18, 0.5, heat)); // ember→orange
    col = mix(col, vec3(1.0,0.95,0.72), smoothstep(0.55, 0.9, heat));                       // →white-hot
    float a = smoothstep(0.10, 0.42, heat + fres * 0.25);                                   // wispy edges
    gl_FragColor = vec4(col, a);
  }
`;

const ICE_FRAG = /* glsl */ `
  uniform float uTime; uniform vec3 uCore; uniform vec3 uGlow;
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vViewDir;
  void main() {
    float fres = pow(1.0 - clamp(dot(vNormal, vViewDir), 0.0, 1.0), 1.3); // sharp rim on flat facets
    float g = fract(sin(dot(floor(vPos * 11.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453 + uTime * 1.4);
    float sparkle = smoothstep(0.9, 1.0, g);                              // icy glints
    vec3 col = mix(uCore, uGlow, fres) + sparkle * 0.7;
    float a = clamp(0.42 + fres * 0.7 + sparkle * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
  }
`;

const HOLY_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vViewDir;
  void main() {
    float ang = atan(vPos.y, vPos.x + 1e-6); // epsilon avoids atan(0,0) NaN at the poles
    float rays = pow(abs(sin(ang * 8.0 + uTime * 1.1)), 6.0);   // 8 rotating god-rays
    float fres = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 1.5);
    float pulse = 0.85 + 0.15 * sin(uTime * 6.0);
    float b = ((1.0 - fres) * 0.8 + rays * 0.7 * fres + 0.2) * pulse;
    vec3 col = mix(vec3(1.0, 0.86, 0.40), vec3(1.0, 1.0, 0.92), clamp(b, 0.0, 1.0)); // gold→white
    gl_FragColor = vec4(col * b, clamp(b, 0.0, 1.0));
  }
`;

const POISON_FRAG = NOISE_GLSL + /* glsl */ `
  uniform float uTime;
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vViewDir;
  void main() {
    vec3 p = vPos * 3.0 + vec3(0.0, -uTime * 0.5, uTime * 0.3);
    float n = fbm(p);
    float bubble = smoothstep(0.55, 0.75, n);
    float fres = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 1.6);
    vec3 col = mix(vec3(0.05, 0.22, 0.04), vec3(0.40, 0.95, 0.20), smoothstep(0.30, 0.70, n)); // murk→toxic
    col = mix(col, vec3(0.80, 1.0, 0.40), bubble * 0.6);                                        // bubble glints
    float a = smoothstep(0.15, 0.5, n + fres * 0.3);
    gl_FragColor = vec4(col, a);
  }
`;

const ARCANE_FRAG = /* glsl */ `
  uniform float uTime; uniform vec3 uCore; uniform vec3 uGlow;
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vViewDir;
  void main() {
    float fres = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 1.4);
    float bands = sin(atan(vPos.z, vPos.x + 1e-6) * 6.0 + uTime * 2.0 + vPos.y * 8.0); // swirling bands (epsilon avoids pole NaN)
    float runes = smoothstep(0.7, 1.0, abs(bands));
    vec3 col = mix(uCore, uGlow, fres) + runes * 0.5;
    float a = clamp(0.4 + fres * 0.7 + runes * 0.4, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
  }
`;

function makeTimeMaterial(frag: string, additive: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: CORE_VERT, fragmentShader: frag,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

export function HolyCore({ radius = 0.42 }: { radius?: number }) {
  const mat = useMemo(() => makeTimeMaterial(HOLY_FRAG, true), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => { mat.uniforms.uTime.value += dt; });
  return <mesh material={mat}><icosahedronGeometry args={[radius, 3]} /></mesh>;
}

export function PoisonCore({ radius = 0.4 }: { radius?: number }) {
  const mat = useMemo(() => makeTimeMaterial(POISON_FRAG, false), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => { mat.uniforms.uTime.value += dt; });
  return <mesh material={mat}><icosahedronGeometry args={[radius, 4]} /></mesh>;
}

export function ArcaneCore({ core, glow, radius = 0.4, spin = 1.4 }: { core: string; glow: string; radius?: number; spin?: number }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCore: { value: new THREE.Color('#ffffff') }, uGlow: { value: new THREE.Color('#ffffff') } },
    vertexShader: CORE_VERT, fragmentShader: ARCANE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);
  useEffect(() => { mat.uniforms.uCore.value.set(core); mat.uniforms.uGlow.value.set(glow); }, [core, glow, mat]);
  useEffect(() => () => mat.dispose(), [mat]);
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { mat.uniforms.uTime.value += dt; if (meshRef.current) meshRef.current.rotation.y += dt * spin; });
  return <mesh ref={meshRef} material={mat}><icosahedronGeometry args={[radius, 2]} /></mesh>;
}

export function FireCore({ radius = 0.4 }: { radius?: number }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: CORE_VERT, fragmentShader: FIRE_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => { mat.uniforms.uTime.value += dt; });
  return <mesh material={mat}><icosahedronGeometry args={[radius, 4]} /></mesh>;
}

export function IceCore({ core, glow, radius = 0.36 }: { core: string; glow: string; radius?: number }) {
  // Flat (non-indexed) facets → crystalline shading off the per-face normal.
  const geom = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(radius, 0).toNonIndexed();
    g.computeVertexNormals();
    return g;
  }, [radius]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCore: { value: new THREE.Color('#ffffff') }, uGlow: { value: new THREE.Color('#ffffff') } },
    vertexShader: CORE_VERT, fragmentShader: ICE_FRAG, transparent: true, depthWrite: false,
  }), []);
  useEffect(() => { mat.uniforms.uCore.value.set(core); mat.uniforms.uGlow.value.set(glow); }, [core, glow, mat]);
  // Separate cleanups: recreating geom (radius change) must not dispose the
  // still-live material, and vice-versa.
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => () => geom.dispose(), [geom]);
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { mat.uniforms.uTime.value += dt; if (meshRef.current) meshRef.current.rotation.y += dt * 0.9; });
  return <mesh ref={meshRef} geometry={geom} material={mat} />;
}

/** Picks the element-appropriate core; falls back to the generic energy orb. */
export function SpellCore({ element, core, glow, radius, spin }: {
  element?: SpellElement; core: string; glow: string; radius?: number; spin?: number;
}) {
  if (element === 'fire') return <FireCore radius={radius} />;
  if (element === 'ice') return <IceCore core={core} glow={glow} radius={radius} />;
  if (element === 'holy') return <HolyCore radius={radius} />;
  if (element === 'poison') return <PoisonCore radius={radius} />;
  if (element === 'arcane') return <ArcaneCore core={core} glow={glow} radius={radius} spin={spin} />;
  return <EnergyOrb core={core} glow={glow} radius={radius} spin={spin} />;
}

// ---- Projectile forms (per-skill silhouette) ------------------------------
// The group is yaw-rotated so local +Z = travel direction; forms point +Z.

export type SpellForm = 'orb' | 'shard' | 'arrow' | 'bolt' | 'comet';

const FRAG_FOR: Record<SpellElement, string> = {
  fire: FIRE_FRAG, ice: ICE_FRAG, holy: HOLY_FRAG, poison: POISON_FRAG, arcane: ARCANE_FRAG,
};
const ADDITIVE_FOR: Record<SpellElement, boolean> = {
  fire: true, ice: false, holy: true, poison: false, arcane: true,
};

/** One element shader material, usable on ANY geometry (decoupled from the
 *  bundled Core meshes), so a fire/ice/arcane surface can wrap a shard, lance,
 *  teardrop, etc. */
function useElementMaterial(element: SpellElement | undefined, core: string, glow: string): THREE.ShaderMaterial {
  const el = element ?? 'arcane';
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCore: { value: new THREE.Color('#ffffff') }, uGlow: { value: new THREE.Color('#ffffff') } },
    vertexShader: CORE_VERT, fragmentShader: FRAG_FOR[el],
    transparent: true, depthWrite: false, blending: ADDITIVE_FOR[el] ? THREE.AdditiveBlending : THREE.NormalBlending,
  }), [el]);
  useEffect(() => { mat.uniforms.uCore.value.set(core); mat.uniforms.uGlow.value.set(glow); }, [core, glow, mat]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => { mat.uniforms.uTime.value += dt; });
  return mat;
}

function useDisposableGeometry(build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const geom = useMemo(build, []);
  useEffect(() => () => geom.dispose(), [geom]);
  return geom;
}

/** Elongated crystalline spindle (ice spear), drilling forward. */
function ShardForm({ mat }: { mat: THREE.ShaderMaterial }) {
  const geom = useDisposableGeometry(() => {
    const g = new THREE.OctahedronGeometry(0.3, 0).toNonIndexed();
    g.scale(0.5, 0.5, 2.3); g.computeVertexNormals();
    return g;
  });
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * 5; });
  return <mesh ref={ref} geometry={geom} material={mat} />;
}

/** Stretched glowing lance (arcane / holy bolt). */
function BoltForm({ mat }: { mat: THREE.ShaderMaterial }) {
  const geom = useDisposableGeometry(() => { const g = new THREE.IcosahedronGeometry(0.22, 2); g.scale(0.72, 0.72, 2.7); return g; });
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * 3; });
  return <mesh ref={ref} geometry={geom} material={mat} />;
}

/** Teardrop flame head (fire comet — the directional trail is the tail). */
function CometForm({ mat }: { mat: THREE.ShaderMaterial }) {
  const geom = useDisposableGeometry(() => { const g = new THREE.IcosahedronGeometry(0.32, 4); g.scale(0.82, 0.82, 1.5); return g; });
  return <mesh geometry={geom} material={mat} />;
}

/** A real arrow (wooden shaft + steel head + fletching) — no shader. */
function ArrowForm() {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.95, 8]} />
        <meshStandardMaterial color="#6b4a2f" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <coneGeometry args={[0.07, 0.22, 8]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.3} />
      </mesh>
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.05, -0.42, Math.sin(a) * 0.05]} rotation={[0, a, 0]}>
          <boxGeometry args={[0.012, 0.16, 0.11]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function OrbForm({ mat }: { mat: THREE.ShaderMaterial }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (ref.current) { ref.current.rotation.y += dt * 2.5; ref.current.rotation.x += dt * 1.5; } });
  return <mesh ref={ref} material={mat}><icosahedronGeometry args={[0.34, 3]} /></mesh>;
}

/** The flying projectile silhouette, by skill form, wrapped in the element shader. */
export function SpellProjectile({ form, element, core, glow }: {
  form?: SpellForm; element?: SpellElement; core: string; glow: string;
}) {
  const mat = useElementMaterial(element, core, glow);
  if (form === 'arrow') return <ArrowForm />;
  if (form === 'shard') return <ShardForm mat={mat} />;
  if (form === 'bolt') return <BoltForm mat={mat} />;
  if (form === 'comet') return <CometForm mat={mat} />;
  return <OrbForm mat={mat} />;
}

export function GroundShockwave({ color, accent, size = 3.2, durationMs = 750, y = -0.9 }: {
  color: string; accent: string; size?: number; durationMs?: number; y?: number;
}) {
  const mat = useMemo(() => makeShockMaterial('#ffffff', '#ffffff'), []);
  useEffect(() => {
    mat.uniforms.uColor.value.set(color);
    mat.uniforms.uAccent.value.set(accent);
  }, [color, accent, mat]);
  useEffect(() => () => mat.dispose(), [mat]);
  const start = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    mat.uniforms.uProgress.value = Math.min(1, ((clock.elapsedTime - start.current) * 1000) / durationMs);
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} material={mat}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}
