import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NOISE_GLSL, SHOCK_VERT } from './spellFx';

/**
 * Deluge — a target-delivered water spell. A roiling cloud GATHERS above the
 * target during the cast, then on impact the cloud holds aloft and POURS a
 * falling water curtain down onto the target, which lands and splashes (ground
 * ripple + droplet crown). Server decides the anchor; this just renders.
 *
 * Like spellFx, all GLSL is module-level so each ShaderMaterial shares ONE
 * compiled program (three's program cache keys on source) — no per-cast hitch.
 */

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

// Pouring water curtain — a wide cylinder between the cloud and the ground. The
// water "front" (uFront) descends from the top so the deluge visibly FALLS, with
// downward-scrolling streaks/foam selling the cascade.
const POUR_VERT = /* glsl */ `
  varying vec2 vUv; varying vec3 vNormal; varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const POUR_FRAG = NOISE_GLSL + /* glsl */ `
  uniform float uTime; uniform vec3 uColor; uniform vec3 uGlow; uniform float uOpacity; uniform float uFront;
  varying vec2 vUv; varying vec3 vNormal; varying vec3 vViewDir;
  void main() {
    // Water has poured from the top down to fillEdge; only below the falling front is wet.
    float fillEdge = 1.0 - uFront;
    float filled = step(fillEdge, vUv.y);
    // Vertical streaks (the curtain) + fbm that scrolls toward the ground.
    float streaks = sin(vUv.x * 42.0 + sin(vUv.y * 6.0 + uTime) * 1.2) * 0.5 + 0.5;
    float flow = fbm(vec3(vUv.x * 9.0, vUv.y * 6.0 + uTime * 4.0, uTime * 0.5));
    float foam = pow(streaks, 1.5) * (0.4 + flow * 0.8);
    float lead = smoothstep(0.2, 0.0, vUv.y - fillEdge);   // bright leading edge of the fall
    float fres = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 1.4);
    vec3 col = mix(uColor, uGlow, clamp(fres * 0.5 + foam * 0.6 + lead, 0.0, 1.0));
    col += foam * 0.4 + lead * 0.6;
    float a = (0.3 + fres * 0.35 + foam * 0.4 + lead * 0.5) * filled * uOpacity;
    gl_FragColor = vec4(col, a);
  }
`;
// Unit curtain (top 0.85 / bottom 1.0 flare, height 1) scaled per cast — open-ended
// so the back wall shows through for a hollow water column.
const POUR_GEOMETRY = new THREE.CylinderGeometry(0.85, 1.0, 1, 28, 1, true);
function makePourMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#ffffff') }, uGlow: { value: new THREE.Color('#ffffff') }, uOpacity: { value: 1 }, uFront: { value: 0 } },
    vertexShader: POUR_VERT, fragmentShader: POUR_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
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

function RippleDisc({ color, accent, radius, durationMs = 700, y = -0.92, delaySeconds = 0 }: {
  color: string; accent: string; radius: number; durationMs?: number; y?: number; delaySeconds?: number;
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
    const elapsed = clock.elapsedTime - start.current - delaySeconds;   // hold flat until the water lands
    if (elapsed < 0) { mat.uniforms.uOpacity.value = 0; return; }
    const t = Math.min(1, (elapsed * 1000) / durationMs);
    mat.uniforms.uProgress.value = t;
    mat.uniforms.uOpacity.value = 1 - smootherFade(t);
  });
  // Unit plane scaled to the radius (UVs are 0..1 so the shader is unaffected) —
  // avoids rebuilding geometry when radius changes.
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} scale={radius * 2} material={mat}>
      <planeGeometry />
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
    const sc = (0.25 + progress * 0.75) * full;
    c.scale.set(sc, sc * 0.62, sc); // swells as the cast fills; flattened like a raincloud
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

// Falling water column spans from the cloud down to the ground.
const POUR_TOP = DELUGE_HEIGHT;
const POUR_BOTTOM = -0.9;

/** Deluge impact — the cloud holds aloft and POURS a falling water curtain down
 *  onto the target, which lands and splashes (ground ripple + droplet crown). */
export function DelugeImpact({ color, accent, radius = 2 }: { color: string; accent: string; radius?: number }) {
  const cloudMat = useMemo(makeWaterMaterial, []);
  const pourMat = useMemo(makePourMaterial, []);
  useEffect(() => { cloudMat.uniforms.uCore.value.set(color); cloudMat.uniforms.uGlow.value.set(accent); }, [color, accent, cloudMat]);
  useEffect(() => { pourMat.uniforms.uColor.value.set(color); pourMat.uniforms.uGlow.value.set(accent); }, [color, accent, pourMat]);
  useEffect(() => () => cloudMat.dispose(), [cloudMat]);
  useEffect(() => () => pourMat.dispose(), [pourMat]);
  const cloud = useRef<THREE.Group>(null);
  const drops = useRef<THREE.Group>(null);
  const pourMesh = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);
  const POUR_END = 0.22;          // the falling water front reaches the ground here
  const full = radius * 0.85;     // cloud spans ~the impact radius
  const dropSpread = radius;      // droplet crown reaches the radius
  const dropScale = 0.08 * radius;
  useFrame(({ clock }, delta) => {
    cloudMat.uniforms.uTime.value += delta;
    pourMat.uniforms.uTime.value += delta;
    if (start.current === null) start.current = clock.elapsedTime;
    const age = clock.elapsedTime - start.current;
    const pourT = Math.min(1, age / POUR_END);     // water front descends 0..1
    const afterLand = Math.max(0, age - POUR_END);
    // Cloud holds aloft (flattened raincloud), shrinks + fades as it empties;
    // cull it once fully faded so it stops costing draw calls before unmount.
    if (cloud.current) {
      const cloudVisible = age < 0.6;
      cloud.current.visible = cloudVisible;
      if (cloudVisible) {
        const s = full * (1 - pourT * 0.25);
        cloud.current.scale.set(s, s * 0.62, s);
      }
    }
    cloudMat.uniforms.uOpacity.value = Math.max(0, 1 - age / 0.6);
    // Pouring curtain: front descends, then the column drains and fades.
    pourMat.uniforms.uFront.value = pourT;
    pourMat.uniforms.uOpacity.value = age < 0.4 ? 1 : Math.max(0, 1 - (age - 0.4) / 0.35);
    if (pourMesh.current) pourMesh.current.visible = age < 0.75;
    // Splash crown bursts up + out once the water lands (culled after it fades).
    if (drops.current) {
      const dropsVisible = age > POUR_END && age < 0.6;
      drops.current.visible = dropsVisible;
      if (dropsVisible) {
        drops.current.children.forEach((c, i) => {
          const sp = SPLASH_DROPS[i]; if (!sp) return;
          c.position.set(Math.cos(sp.a) * sp.speed * afterLand * 2 * dropSpread, -0.7 + sp.speed * afterLand * 5 - afterLand * afterLand * 11, Math.sin(sp.a) * sp.speed * afterLand * 2 * dropSpread);
        });
      }
    }
  });
  return (
    <group>
      <RippleDisc color={color} accent={accent} radius={radius} delaySeconds={POUR_END} />
      <group ref={cloud} position={[0, DELUGE_HEIGHT, 0]}>
        {WATER_BLOBS.map((b, i) => (
          <mesh key={i} geometry={BLOB_GEOMETRY} material={cloudMat} position={[b.x, b.y, b.z]} scale={b.r} />
        ))}
      </group>
      <mesh ref={pourMesh} geometry={POUR_GEOMETRY} material={pourMat}
        position={[0, (POUR_TOP + POUR_BOTTOM) / 2, 0]}
        scale={[full * 0.6, POUR_TOP - POUR_BOTTOM, full * 0.6]} />
      <group ref={drops}>
        {SPLASH_DROPS.map((_, i) => (<mesh key={i} geometry={DROP_GEOMETRY} material={cloudMat} scale={dropScale} />))}
      </group>
    </group>
  );
}
