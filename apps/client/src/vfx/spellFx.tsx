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

// Static form geometries — projectiles spawn/despawn constantly, so build the
// shapes once at module scope and share them across every cast (no GC churn).
const SHARD_GEOMETRY = (() => { const g = new THREE.OctahedronGeometry(0.3, 0).toNonIndexed(); g.scale(0.5, 0.5, 2.3); g.computeVertexNormals(); return g; })();
const BOLT_GEOMETRY = (() => { const g = new THREE.IcosahedronGeometry(0.22, 2); g.scale(0.72, 0.72, 2.7); return g; })();
const COMET_GEOMETRY = (() => { const g = new THREE.IcosahedronGeometry(0.32, 4); g.scale(0.82, 0.82, 1.5); return g; })();

/** Elongated crystalline spindle (ice spear), drilling forward. */
function ShardForm({ mat }: { mat: THREE.ShaderMaterial }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * 5; });
  return <mesh ref={ref} geometry={SHARD_GEOMETRY} material={mat} />;
}

/** Stretched glowing lance (arcane / holy bolt). */
function BoltForm({ mat }: { mat: THREE.ShaderMaterial }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * 3; });
  return <mesh ref={ref} geometry={BOLT_GEOMETRY} material={mat} />;
}

/** Teardrop flame head (fire comet — the directional trail is the tail). */
function CometForm({ mat }: { mat: THREE.ShaderMaterial }) {
  return <mesh geometry={COMET_GEOMETRY} material={mat} />;
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

/** Shader-surfaced forms (orb/shard/bolt/comet). Split out so the physical
 *  arrow never builds/animates an element material it doesn't use. */
function ShaderProjectileForm({ form, element, core, glow }: {
  form?: SpellForm; element?: SpellElement; core: string; glow: string;
}) {
  const mat = useElementMaterial(element, core, glow);
  if (form === 'shard') return <ShardForm mat={mat} />;
  if (form === 'bolt') return <BoltForm mat={mat} />;
  if (form === 'comet') return <CometForm mat={mat} />;
  return <OrbForm mat={mat} />;
}

/** The flying projectile silhouette, by skill form, wrapped in the element shader. */
export function SpellProjectile({ form, element, core, glow }: {
  form?: SpellForm; element?: SpellElement; core: string; glow: string;
}) {
  if (form === 'arrow') return <ArrowForm />;
  return <ShaderProjectileForm form={form} element={element} core={core} glow={glow} />;
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

// ---- Delivery mechanics (alternatives to "a projectile flies A→B") ---------
// Rendered during the Impact state, anchored at the target; the flying
// projectile is suppressed for these so the spell reads as a distinct mechanic.

export type SpellMechanic = 'projectile' | 'strike' | 'erupt' | 'deluge';

/** Holy strike — a column of light slams down from the sky onto the target. */
export function StrikeImpact({ color, accent }: { color: string; accent: string }) {
  // Own the materials (not inline JSX props): CastVfx re-renders on snapshot
  // updates, which would reset inline opacity/colour and flicker the strike.
  const pillarMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  useEffect(() => { pillarMat.color.set(accent); }, [accent, pillarMat]);
  useEffect(() => { flashMat.color.set(color); }, [color, flashMat]);
  useEffect(() => () => pillarMat.dispose(), [pillarMat]);
  useEffect(() => () => flashMat.dispose(), [flashMat]);
  const pillar = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - start.current) / 0.55);
    pillarMat.opacity = (1 - t) * 0.85;
    flashMat.opacity = (1 - t) * 0.7;
    if (pillar.current) { const s = 1 - t * 0.45; pillar.current.scale.set(s, 1, s); }
    flash.current?.scale.setScalar(0.6 + t * 1.6);
  });
  return (
    <group>
      <GroundShockwave color={color} accent={accent} size={4.5} durationMs={550} />
      <mesh ref={pillar} position={[0, 3.5, 0]} material={pillarMat}>
        <cylinderGeometry args={[0.5, 0.85, 9, 18, 1, true]} />
      </mesh>
      <mesh ref={flash} position={[0, -0.7, 0]} material={flashMat}>
        <sphereGeometry args={[0.7, 18, 18]} />
      </mesh>
    </group>
  );
}

// Spike geometry: base translated to y=0 so scaling Y grows it up from the ground.
const SPIKE_GEOMETRY = (() => { const g = new THREE.ConeGeometry(0.16, 1.3, 6); g.translate(0, 0.65, 0); return g; })();
const ERUPT_SPIKES = [
  { a: 0.3, r: 0.0, s: 1.1, tilt: 0.0 }, { a: 1.4, r: 0.55, s: 0.8, tilt: 0.18 },
  { a: 2.7, r: 0.62, s: 0.9, tilt: -0.2 }, { a: 4.0, r: 0.5, s: 0.7, tilt: 0.15 },
  { a: 5.3, r: 0.58, s: 0.85, tilt: -0.12 },
];

/** Erupt — jagged spikes burst up out of the ground at the target. */
export function EruptImpact({ color, accent }: { color: string; accent: string }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(accent), emissiveIntensity: 0.35, roughness: 0.85, transparent: true }), [color, accent]);
  useEffect(() => () => mat.dispose(), [mat]);
  const groupRef = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const age = clock.elapsedTime - start.current;
    const rise = Math.min(1, age / 0.16);
    mat.opacity = Math.max(0, 1 - Math.max(0, age - 0.35) / 0.6);
    const g = groupRef.current;
    if (g) g.children.forEach((c, i) => { const s = ERUPT_SPIKES[i]?.s ?? 1; c.scale.set(s, s * rise, s); });
  });
  return (
    <group>
      <GroundShockwave color={accent} accent={color} size={3.4} durationMs={520} />
      <group ref={groupRef}>
        {ERUPT_SPIKES.map((sp, i) => (
          <mesh key={i} geometry={SPIKE_GEOMETRY} material={mat}
            position={[Math.cos(sp.a) * sp.r, -1, Math.sin(sp.a) * sp.r]}
            rotation={[sp.tilt, sp.a, sp.tilt]} scale={[sp.s, 0, sp.s]} />
        ))}
      </group>
    </group>
  );
}

// Shared unit sphere for water blobs/droplets (scaled per instance). Enough
// segments that the vertex displacement reads as a roiling surface.
const BLOB_GEOMETRY = new THREE.SphereGeometry(1, 24, 18);
const DROP_GEOMETRY = new THREE.SphereGeometry(1, 8, 6);
// A full, puffy cloud of overlapping blobs that spans ~1 unit radius (scaled to
// the impact radius at use). More blobs = a denser, fuller water mass.
const WATER_BLOBS = [
  { x: 0, y: 0, z: 0, r: 0.55 }, { x: 0.5, y: 0.05, z: 0.12, r: 0.4 },
  { x: -0.48, y: 0.02, z: -0.1, r: 0.42 }, { x: 0.18, y: 0.12, z: 0.5, r: 0.36 },
  { x: -0.24, y: 0.1, z: -0.46, r: 0.38 }, { x: 0.32, y: -0.06, z: -0.32, r: 0.34 },
  { x: -0.36, y: -0.04, z: 0.34, r: 0.34 }, { x: 0.62, y: -0.02, z: -0.4, r: 0.28 },
  { x: -0.6, y: 0.04, z: 0.42, r: 0.3 }, { x: 0.05, y: -0.1, z: -0.6, r: 0.3 },
  { x: -0.05, y: 0.14, z: 0.0, r: 0.4 }, { x: 0.4, y: 0.08, z: -0.05, r: 0.3 },
];
const SPLASH_DROPS = Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * Math.PI * 2, speed: 0.65 + (i % 4) * 0.16 }));
const DELUGE_HEIGHT = 2.5;   // gather height above the target — deliberately not too high

// Roiling water surface: vertices are pushed along their normal by drifting fbm
// so the blob actually undulates like a churning water mass.
const WATER_VERT = NOISE_GLSL + /* glsl */ `
  uniform float uTime;
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vViewDir; varying float vCrest;
  void main() {
    vPos = position;
    float d = fbm(position * 2.3 + vec3(0.0, uTime * 0.9, uTime * 0.25));
    vCrest = d;
    vec3 displaced = position + normal * ((d - 0.5) * 0.36); // surface roil
    vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
// Translucent magical water: fresnel rim + churn + caustic glints riding the crests.
const WATER_FRAG = NOISE_GLSL + /* glsl */ `
  uniform float uTime; uniform vec3 uCore; uniform vec3 uGlow; uniform float uOpacity;
  varying vec3 vPos; varying vec3 vNormal; varying vec3 vViewDir; varying float vCrest;
  void main() {
    float fres = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.0);
    vec3 p = vPos * 3.5 + vec3(0.0, uTime * 0.8, uTime * 0.4);
    float churn = fbm(p);
    float glint = pow(max(churn, 0.0), 4.0) + pow(max(vCrest, 0.0), 3.0) * 0.5; // caustic sparkles + crest highlights
    vec3 col = mix(uCore, uGlow, clamp(fres * 0.8 + churn * 0.35 + vCrest * 0.2, 0.0, 1.0));
    col += fres * 0.4 + glint * 0.7;
    float a = clamp(0.32 + fres * 0.6 + glint * 0.3, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(col, a);
  }
`;

function makeWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCore: { value: new THREE.Color('#ffffff') }, uGlow: { value: new THREE.Color('#ffffff') }, uOpacity: { value: 1 } },
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false,
  });
}

// Ground ripple — an expanding wavefront fills a disc to the full impact radius,
// with concentric ripples, a bright leading rim, and a caustic shimmer.
const RIPPLE_FRAG = /* glsl */ `
  uniform float uTime; uniform vec3 uColor; uniform vec3 uAccent; uniform float uProgress; uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0; // 0 centre .. 1 disc edge (= impact radius)
    float inDisc = step(d, 1.0);
    float front = smoothstep(uProgress, uProgress - 0.22, d);            // filled up to the wavefront
    float rim = smoothstep(0.09, 0.0, abs(d - uProgress));               // bright leading edge
    float ripple = sin(d * 30.0 - uTime * 10.0) * 0.5 + 0.5;             // concentric ripples
    float caustic = pow(ripple, 3.0);
    vec3 col = mix(uColor, uAccent, clamp(caustic * 0.6 + rim, 0.0, 1.0));
    float a = (front * (0.22 + caustic * 0.4) + rim * 0.55) * inDisc * uOpacity;
    gl_FragColor = vec4(col, a);
  }
`;

function RippleDisc({ color, accent, radius, durationMs = 700, y = -0.92 }: {
  color: string; accent: string; radius: number; durationMs?: number; y?: number;
}) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#ffffff') }, uAccent: { value: new THREE.Color('#ffffff') }, uProgress: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: SHOCK_VERT, fragmentShader: RIPPLE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }), []);
  useEffect(() => { mat.uniforms.uColor.value.set(color); mat.uniforms.uAccent.value.set(accent); }, [color, accent, mat]);
  useEffect(() => () => mat.dispose(), [mat]);
  const start = useRef<number | null>(null);
  useFrame(({ clock }, delta) => {
    mat.uniforms.uTime.value += delta;
    if (start.current === null) start.current = clock.elapsedTime;
    const t = Math.min(1, ((clock.elapsedTime - start.current) * 1000) / durationMs);
    mat.uniforms.uProgress.value = t;
    mat.uniforms.uOpacity.value = 1 - smootherFade(t);
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} material={mat}>
      <planeGeometry args={[radius * 2, radius * 2]} />
    </mesh>
  );
}

function smootherFade(t: number): number { return t < 0.7 ? 0 : (t - 0.7) / 0.3; }

/** Cast windup for deluge — the water cloud GATHERS above the target, growing
 *  with cast progress and drifting, before it falls on impact. */
export function DelugeCast({ progress, color, accent, radius = 2 }: { progress: number; color: string; accent: string; radius?: number }) {
  const mat = useMemo(makeWaterMaterial, []);
  useEffect(() => { mat.uniforms.uCore.value.set(color); mat.uniforms.uGlow.value.set(accent); }, [color, accent, mat]);
  useEffect(() => () => mat.dispose(), [mat]);
  const cloud = useRef<THREE.Group>(null);
  const full = radius * 0.85; // the cloud spans ~the impact radius
  useFrame(({ clock }, delta) => {
    mat.uniforms.uTime.value += delta;
    const c = cloud.current; if (!c) return;
    c.scale.setScalar((0.25 + progress * 0.75) * full); // swells as the cast fills
    c.position.y = DELUGE_HEIGHT + Math.sin(clock.elapsedTime * 2.2) * 0.07; // gentle bob
    c.rotation.y += delta * 0.3; // frame-rate independent
    mat.uniforms.uOpacity.value = 0.6 + progress * 0.35;
  });
  return (
    <group ref={cloud} position={[0, DELUGE_HEIGHT, 0]}>
      {WATER_BLOBS.map((b, i) => (
        <mesh key={i} geometry={BLOB_GEOMETRY} material={mat} position={[b.x, b.y, b.z]} scale={b.r} />
      ))}
    </group>
  );
}

/** Deluge impact — the gathered cloud crashes DOWN, splats and spreads across
 *  the impact radius, and rings out (shader ripple disc + droplet crown). */
export function DelugeImpact({ color, accent, radius = 2 }: { color: string; accent: string; radius?: number }) {
  const cloudMat = useMemo(makeWaterMaterial, []);
  useEffect(() => { cloudMat.uniforms.uCore.value.set(color); cloudMat.uniforms.uGlow.value.set(accent); }, [color, accent, cloudMat]);
  useEffect(() => () => cloudMat.dispose(), [cloudMat]);
  const cloud = useRef<THREE.Group>(null);
  const drops = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  const LAND = 0.24;              // the cloud (formed during the cast) drops and lands here
  const full = radius * 0.85;     // gathered cloud spans ~the impact radius
  const dropSpread = radius;      // droplet crown reaches the radius
  const dropScale = 0.08 * radius;
  useFrame(({ clock }, delta) => {
    cloudMat.uniforms.uTime.value += delta;
    if (start.current === null) start.current = clock.elapsedTime;
    const age = clock.elapsedTime - start.current;
    const fall = Math.min(1, age / LAND);
    const easeFall = fall * fall;
    if (cloud.current) {
      cloud.current.position.y = DELUGE_HEIGHT * (1 - easeFall) + (-0.4) * easeFall;
      // On landing the mass flattens (Y) and SPREADS (XZ) across the area.
      cloud.current.scale.set(full * (1 + fall * 0.6), full * (1 - fall * 0.7), full * (1 + fall * 0.6));
    }
    cloudMat.uniforms.uOpacity.value = age < LAND ? 1 : Math.max(0, 1 - (age - LAND) / 0.4);
    if (drops.current) {
      drops.current.visible = age > LAND;
      const dt2 = Math.max(0, age - LAND);
      drops.current.children.forEach((c, i) => {
        const sp = SPLASH_DROPS[i]; if (!sp) return;
        c.position.set(Math.cos(sp.a) * sp.speed * dt2 * 2 * dropSpread, -0.7 + sp.speed * dt2 * 4 - dt2 * dt2 * 9, Math.sin(sp.a) * sp.speed * dt2 * 2 * dropSpread);
      });
    }
  });
  return (
    <group>
      <RippleDisc color={color} accent={accent} radius={radius} />
      <group ref={cloud} position={[0, DELUGE_HEIGHT, 0]}>
        {WATER_BLOBS.map((b, i) => (
          <mesh key={i} geometry={BLOB_GEOMETRY} material={cloudMat} position={[b.x, b.y, b.z]} scale={b.r} />
        ))}
      </group>
      <group ref={drops}>
        {SPLASH_DROPS.map((_, i) => (<mesh key={i} geometry={DROP_GEOMETRY} material={cloudMat} scale={dropScale} />))}
      </group>
    </group>
  );
}
