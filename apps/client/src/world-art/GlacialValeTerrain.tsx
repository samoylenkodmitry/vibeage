import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLACIAL_VALE, VALE_TARN_WATER_Y, getTerrainHeight, glacialValeMask } from '../../../../packages/content/terrain';
import { seededRandom } from './foliageScatter';

/**
 * Glacial Vale rendering, ported from deedy/glacial-valley (the user's
 * explicit ask: use that project's code). The reference's look comes from
 * PER-PIXEL procedural ground shading — slope/height-driven rock, scree and
 * snow with fbm boundary breakup, triplanar granite strata — not from
 * geometry or textures. Our base chunks shade per-vertex, which is why the
 * vale kept reading flat; this overlay mesh + the boulders + the water carry
 * the reference's fragment shaders, adapted to VibeAge's moving sun (live
 * scene-light uniforms, the WorldShaderGrass mechanism) and scene fog.
 * Dropped from the reference: baked ray-marched sun shadows (their sun is
 * static), screen-space refraction (two-pass), seasons.
 */
const OVERLAY_SEGMENTS = 168;
const OVERLAY_HALF = 660; // covers the mask (ellipse ≤620) + blend edge
const BOULDER_COUNT = 56;

// ── GLSL library (verbatim from the reference's COMMON) ─────────────────────
const GLSL_NOISE = /* glsl */ `
  float hash12(vec2 p){
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec2 hash22(vec2 p){
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }
  float vnoise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    float a = hash12(i);
    float b = hash12(i+vec2(1.0,0.0));
    float c = hash12(i+vec2(0.0,1.0));
    float d = hash12(i+vec2(1.0,1.0));
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
  }
  float fbm(vec2 p){
    float a = 0.0, w = 0.5;
    for (int i = 0; i < 5; i++){ a += w*vnoise(p); p = p*2.03 + vec2(17.3, 9.1); w *= 0.5; }
    return a;
  }
  float vor(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float md = 8.0;
    for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++){
      vec2 g = vec2(float(x), float(y));
      vec2 r = g + hash22(i+g) - f;
      md = min(md, dot(r, r));
    }
    return sqrt(md);
  }
`;

const LIGHT_FOG_UNIFORMS = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunLight;
  uniform vec3 uHemiSky;
  uniform vec3 uHemiGround;
  uniform vec3 uAmbientLight;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
`;

function makeLightFogUniforms() {
  return {
    uTime: { value: 0 },
    uWaterY: { value: VALE_TARN_WATER_Y },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunLight: { value: new THREE.Color(1, 0.95, 0.85) },
    uHemiSky: { value: new THREE.Color(0.5, 0.55, 0.6) },
    uHemiGround: { value: new THREE.Color(0.2, 0.25, 0.2) },
    uAmbientLight: { value: new THREE.Color(0.25, 0.25, 0.27) },
    uFogColor: { value: new THREE.Color('#a4d2e3') },
    uFogNear: { value: 500 },
    uFogFar: { value: 2600 },
  };
}

// ── Ground overlay: the reference's terrainFrag core ────────────────────────
const GROUND_VERT = /* glsl */ `
  varying vec3 vWp;
  varying vec3 vNrm;
  varying float vMask;
  attribute float aMask;
  void main(){
    vWp = (modelMatrix * vec4(position, 1.0)).xyz;
    vNrm = normalize(mat3(modelMatrix) * normal);
    vMask = aMask;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GROUND_FRAG = /* glsl */ `
  varying vec3 vWp;
  varying vec3 vNrm;
  varying float vMask;
  uniform float uTime;
  uniform float uWaterY;
  ${LIGHT_FOG_UNIFORMS}
  ${GLSL_NOISE}
  void main(){
    vec3 N = normalize(vNrm);
    float slope = clamp(1.0 - N.y, 0.0, 1.0);
    float relH = vWp.y - uWaterY;
    float big = fbm(vWp.xz*0.018);

    // slope/height masks with fbm boundary breakup (reference terrainFrag)
    float rockM  = smoothstep(0.16, 0.30, slope + (big - 0.5)*0.18);
    float screeM = smoothstep(0.085, 0.16, slope) * (1.0 - rockM) * smoothstep(6.0, 40.0, relH);
    float snowLine = 26.0 + 30.0*(fbm(vWp.xz*0.011) - 0.5);
    float snowM = smoothstep(snowLine, snowLine + 14.0, relH);
    snowM *= smoothstep(0.60, 0.28, slope + (fbm(vWp.xz*0.02 + 3.0) - 0.5)*0.25);
    snowM *= 0.55 + 0.45*smoothstep(0.30, 0.55, fbm(vWp.xz*0.006 + 11.0));
    snowM = clamp(snowM*1.6, 0.0, 1.0);
    snowM = max(snowM, smoothstep(snowLine - 12.0, snowLine + 6.0, relH)*smoothstep(0.20, 0.06, slope)*0.7);

    // granite: triplanar detail + warped strata bands (verbatim palette)
    vec3 aw = pow(abs(N), vec3(3.0)); aw /= (aw.x + aw.y + aw.z);
    float strata = fbm(vec2(vWp.y*0.055 + fbm(vWp.xz*0.004)*6.0, (vWp.x + vWp.z)*0.002));
    float rdet = fbm(vWp.zy*0.11)*aw.x + fbm(vWp.xz*0.11)*aw.y + fbm(vWp.xy*0.11)*aw.z;
    vec3 rockCol = mix(vec3(0.235, 0.225, 0.215), vec3(0.34, 0.325, 0.30), rdet);
    rockCol *= 0.78 + 0.5*strata;
    rockCol *= 1.0 - 0.35*smoothstep(0.32, 0.20, strata);
    rockCol = mix(rockCol, vec3(0.50, 0.47, 0.43), smoothstep(0.62, 0.72, strata)*0.5);

    vec3 screeCol = mix(vec3(0.30, 0.29, 0.28), vec3(0.385, 0.37, 0.35), vnoise(vWp.xz*2.2));
    screeCol *= 0.85 + 0.3*vor(vWp.xz*1.3);

    // valley-floor glacial gravel: cool grey with pebble voronoi
    float peb = 1.0 - vor(vWp.xz*4.5);
    vec3 floorCol = mix(vec3(0.33, 0.345, 0.37), vec3(0.45, 0.465, 0.49), vnoise(vWp.xz*1.8));
    floorCol = mix(floorCol, floorCol*1.14, smoothstep(0.45, 0.85, peb)*0.5);

    vec3 alb = floorCol;
    alb = mix(alb, screeCol, screeM);
    alb = mix(alb, rockCol, rockM);

    // wet/dry darkening band along the tarn shoreline
    float wetM = 1.0 - smoothstep(0.02, 0.5 + 0.3*vnoise(vWp.xz*1.2), relH);
    alb *= 1.0 - 0.45*clamp(wetM, 0.0, 1.0);

    // snow with wind-strata shading (reference 'sast')
    vec3 snowCol = vec3(0.84, 0.87, 0.96);
    float sast = sin(dot(vWp.xz, vec2(0.83, 0.55))*0.9 + fbm(vWp.xz*0.05)*9.0);
    snowCol *= 0.93 + 0.07*sast;
    alb = mix(alb, snowCol, snowM);

    // live day-cycle lighting (our adaptation of litSurface)
    float hemiW = N.y*0.5 + 0.5;
    vec3 irradiance = uAmbientLight + mix(uHemiGround, uHemiSky, hemiW)
                    + uSunLight * max(dot(N, uSunDir), 0.0);
    vec3 col = alb * irradiance;

    // snow sparkle (reference's frost glints, sized to our scale)
    if (snowM > 0.05){
      float g = step(0.992, hash12(floor(vWp.xz*42.0)));
      col += uSunLight * g * snowM * 0.4;
    }

    float fogF = smoothstep(uFogNear, uFogFar, length(vWp - cameraPosition));
    col = mix(col, uFogColor, fogF);
    float alpha = smoothstep(0.02, 0.22, vMask);
    gl_FragColor = vec4(col, alpha);
  }
`;

// ── Water: reference waterFrag minus the refraction pass ────────────────────
const WATER_VERT = /* glsl */ `
  varying vec3 vWp;
  void main(){
    vWp = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WATER_FRAG = /* glsl */ `
  varying vec3 vWp;
  uniform float uTime;
  uniform float uWaterY;
  ${LIGHT_FOG_UNIFORMS}
  ${GLSL_NOISE}
  // Analytic tarn bed (mirrors glacialValeHeight's floor terms).
  float groundH(vec2 p){
    vec2 d = p - vec2(${GLACIAL_VALE.x.toFixed(1)}, ${GLACIAL_VALE.z.toFixed(1)});
    float u = d.x*${GLACIAL_VALE.cos.toFixed(5)} + d.y*${GLACIAL_VALE.sin.toFixed(5)};
    float v = -d.x*${GLACIAL_VALE.sin.toFixed(5)} + d.y*${GLACIAL_VALE.cos.toFixed(5)};
    float floorY = 2.5 + sin(u*0.05)*sin(v*0.047)*0.8;
    float tarnE = (u/190.0)*(u/190.0) + (v/75.0)*(v/75.0);
    float tarn = 1.0 - smoothstep(0.45, 1.0, tarnE);
    return mix(floorY, -9.0, tarn);
  }
  float wH(vec2 p, float t){
    float h = 0.0;
    h += vnoise(p*vec2(0.11, 0.26) + vec2(-t*1.35, t*0.18))*0.034;
    h += vnoise(p*vec2(0.26, 0.60) + vec2(-t*2.30, -t*0.32))*0.016;
    h += vnoise(p*vec2(0.56, 1.20) + vec2(-t*3.60, t*0.55))*0.008;
    h += vnoise(p*0.045 + vec2(-t*0.50, 0.0))*0.050;
    return h;
  }
  void main(){
    float t = uTime;
    vec3 toP = vWp - cameraPosition;
    float dist = length(toP);
    vec3 vd = toP / max(dist, 0.001);
    vec2 p = vWp.xz;

    float depth0 = max(uWaterY - groundH(p), 0.0);

    float e = 0.45;
    float h0 = wH(p, t);
    float hx = wH(p + vec2(e, 0.0), t);
    float hz = wH(p + vec2(0.0, e), t);
    float nscale = 1.0/(1.0 + dist*0.010);
    vec3 N = normalize(vec3(-(hx - h0)/e*nscale, 1.0, -(hz - h0)/e*nscale));

    // bed colour stands in for the refraction pass: cool gravel + caustics
    vec3 bed = mix(vec3(0.30, 0.33, 0.36), vec3(0.42, 0.45, 0.48), vnoise(p*1.8));
    float ca = pow(1.0 - vor(p*0.9 + vec2(-t*0.9, t*0.25)), 5.0)
             + pow(1.0 - vor(p*1.4 + vec2(-t*1.3, -t*0.30)), 5.0);
    bed *= 1.0 + ca * 1.1 * exp(-depth0*1.2);

    // glacial water: fast red absorption + rock-flour scattering (verbatim)
    vec3 rdir = refract(vd, vec3(0.0, 1.0, 0.0), 0.752);
    float path = depth0 / max(0.30, -rdir.y);
    vec3 trans = exp(-path * vec3(0.62, 0.18, 0.14) * 1.5);
    float scA = 1.0 - exp(-path*0.30);
    vec3 sunAmb = uSunLight*0.10 + uHemiSky*0.55;
    vec3 under = bed * trans + vec3(0.07, 0.38, 0.36) * scA * sunAmb * 2.4;

    // sky reflection + fresnel
    vec3 refl = mix(uFogColor, uHemiSky, 0.45) * 1.15;
    float fres = 0.02 + 0.98*pow(1.0 - max(dot(N, -vd), 0.0), 5.0);
    vec3 col = mix(under, refl, clamp(fres, 0.0, 1.0));

    // sun glitter (reference's double-lobe highlight)
    vec3 hv = normalize(uSunDir - vd);
    float ndh = max(dot(N, hv), 0.0);
    col += uSunLight * (pow(ndh, 750.0)*1.6 + pow(ndh, 90.0)*0.07);

    // shoreline foam
    float foamN = fbm(vec2(p.x*0.35 + t*1.2, p.y*1.3));
    float shore = smoothstep(1.1, 0.12, depth0);
    float foam = clamp(shore*(0.55 + 0.45*foamN), 0.0, 1.0);
    vec3 foamCol = vec3(0.9) * (uSunLight*0.12 + uHemiSky*0.7);
    col = mix(col, foamCol, foam*0.7);

    float fogF = smoothstep(uFogNear, uFogFar, dist);
    col = mix(col, uFogColor, fogF);
    // depth-faded alpha gives a natural shoreline (no disc rim)
    float alpha = clamp(depth0*1.8, 0.0, 0.95);
    gl_FragColor = vec4(col, max(alpha, foam*0.8));
  }
`;

// ── Boulders: reference rockVert/rockFrag (noise-displaced icosahedra) ──────
const ROCK_VERT = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec4 aParam;   // scale, yaw, seed, flatten
  varying vec3 vWp;
  varying vec3 vNrm;
  varying float vSeed;
  ${GLSL_NOISE}
  void main(){
    float scale = aParam.x, yaw = aParam.y, seed = aParam.z, flat_ = aParam.w;
    vSeed = seed;
    vec3 lp = position * vec3(1.0, flat_, 1.0);
    vec3 ln = normalize(normal / vec3(1.0, flat_, 1.0));
    float n = (vnoise(lp.xy*2.3 + seed) + vnoise(lp.yz*2.3 + seed*1.7) + vnoise(lp.zx*2.3 + seed*2.3))/3.0;
    float n2 = vnoise(lp.xz*5.0 + seed*3.1);
    lp *= 0.58 + 0.64*n + 0.16*n2;
    ln = normalize(mix(ln, normalize(lp), 0.7));
    float cy = cos(yaw), sy = sin(yaw);
    vec3 rp = vec3(lp.x*cy + lp.z*sy, lp.y, -lp.x*sy + lp.z*cy);
    vec3 rn = vec3(ln.x*cy + ln.z*sy, ln.y, -ln.x*sy + ln.z*cy);
    vec3 wp = aOffset + rp*scale;
    vWp = wp;
    vNrm = rn;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const ROCK_FRAG = /* glsl */ `
  varying vec3 vWp;
  varying vec3 vNrm;
  varying float vSeed;
  uniform float uTime;
  uniform float uWaterY;
  ${LIGHT_FOG_UNIFORMS}
  ${GLSL_NOISE}
  void main(){
    vec3 toP = vWp - cameraPosition;
    float dist = length(toP);
    vec3 N = normalize(vNrm);

    vec3 aw = pow(abs(N), vec3(3.0)); aw /= (aw.x + aw.y + aw.z);
    float det = fbm(vWp.zy*1.4 + vSeed)*aw.x + fbm(vWp.xz*1.4 + vSeed)*aw.y + fbm(vWp.xy*1.4 + vSeed)*aw.z;
    float hue = hash12(vec2(vSeed, vSeed*1.7));
    vec3 alb = mix(vec3(0.30, 0.29, 0.28), vec3(0.46, 0.43, 0.39), det);
    alb = mix(alb, vec3(0.36, 0.345, 0.33), hue*0.35);
    alb *= 0.85 + 0.3*vnoise(vWp.xz*8.0 + vSeed);

    // wet collar at the waterline (reference) + snow cap on up-facing tops
    float relH = vWp.y - uWaterY;
    float wetM = 1.0 - smoothstep(0.02, 0.30 + 0.25*vnoise(vWp.xz*2.5), relH);
    alb *= 1.0 - 0.50*clamp(wetM, 0.0, 1.0);
    float snowCap = smoothstep(0.55, 0.85, N.y) * smoothstep(18.0, 32.0, relH);
    alb = mix(alb, vec3(0.84, 0.87, 0.96), snowCap);

    float hemiW = N.y*0.5 + 0.5;
    vec3 irradiance = uAmbientLight + mix(uHemiGround, uHemiSky, hemiW)
                    + uSunLight * max(dot(N, uSunDir), 0.0);
    vec3 col = alb * irradiance;

    float fogF = smoothstep(uFogNear, uFogFar, dist);
    col = mix(col, uFogColor, fogF);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Builds the CPU-displaced overlay grid (exact heights, baked normals). */
function buildOverlayGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(OVERLAY_HALF * 2, OVERLAY_HALF * 2, OVERLAY_SEGMENTS, OVERLAY_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const mask = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i) + GLACIAL_VALE.x;
    const z = pos.getZ(i) + GLACIAL_VALE.z;
    pos.setY(i, getTerrainHeight(x, z) + 0.12);
    mask[i] = glacialValeMask(x, z);
  }
  geometry.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/** Seeded boulder field on the floor and lower slopes. */
function buildBoulderAttributes(): { offsets: Float32Array; params: Float32Array; count: number } {
  const random = seededRandom(0xb0, 0x1de5);
  const offsets = new Float32Array(BOULDER_COUNT * 3);
  const params = new Float32Array(BOULDER_COUNT * 4);
  let n = 0;
  let tries = 0;
  while (n < BOULDER_COUNT && tries < BOULDER_COUNT * 20) {
    tries += 1;
    const u = (random() - 0.5) * 1_000;
    const v = (random() - 0.5) * 560;
    const s = 0.8 + Math.pow(random(), 1.6) * 2.6;
    const yaw = random() * Math.PI * 2;
    const seed = random() * 100;
    const flat = 0.55 + random() * 0.5;
    const x = GLACIAL_VALE.x + u * GLACIAL_VALE.cos - v * GLACIAL_VALE.sin;
    const z = GLACIAL_VALE.z + u * GLACIAL_VALE.sin + v * GLACIAL_VALE.cos;
    const h = getTerrainHeight(x, z);
    if (h < VALE_TARN_WATER_Y - 0.5 || h > 34) continue;
    offsets[n * 3] = x; offsets[n * 3 + 1] = h + s * 0.1; offsets[n * 3 + 2] = z;
    params[n * 4] = s; params[n * 4 + 1] = yaw; params[n * 4 + 2] = seed; params[n * 4 + 3] = flat;
    n += 1;
  }
  return { offsets, params, count: n };
}

/** One shared per-frame light/fog uniform updater for all vale materials. */
function useValeLightUniforms(materials: THREE.ShaderMaterial[]) {
  const sunRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiRef = useRef<THREE.HemisphereLight | null>(null);
  const ambientRef = useRef<THREE.AmbientLight | null>(null);
  const frameRef = useRef(0);
  useFrame(({ scene, camera }, dt) => {
    frameRef.current += 1;
    if ((!sunRef.current || !hemiRef.current || !ambientRef.current) && frameRef.current % 30 === 1) {
      scene.traverse((o) => {
        if ((o as THREE.DirectionalLight).isDirectionalLight) sunRef.current = o as THREE.DirectionalLight;
        if ((o as THREE.HemisphereLight).isHemisphereLight) hemiRef.current = o as THREE.HemisphereLight;
        if ((o as THREE.AmbientLight).isAmbientLight) ambientRef.current = o as THREE.AmbientLight;
      });
    }
    const sun = sunRef.current;
    const hemi = hemiRef.current;
    const ambient = ambientRef.current;
    const fog = scene.fog as THREE.Fog | null;
    for (const material of materials) {
      const u = material.uniforms;
      u.uTime.value += dt;
      if (sun) {
        u.uSunDir.value.set(sun.position.x - camera.position.x, sun.position.y, sun.position.z - camera.position.z).normalize();
        const gate = Math.min(1, Math.max(0, (u.uSunDir.value.y - 0.0) / 0.12));
        u.uSunLight.value.copy(sun.color).multiplyScalar(sun.intensity * gate);
      }
      if (hemi) {
        u.uHemiSky.value.copy(hemi.color).multiplyScalar(hemi.intensity);
        u.uHemiGround.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity);
      }
      if (ambient) u.uAmbientLight.value.copy(ambient.color).multiplyScalar(ambient.intensity);
      if (fog?.color) {
        u.uFogColor.value.copy(fog.color);
        u.uFogNear.value = fog.near;
        u.uFogFar.value = fog.far;
      }
    }
  });
}

export function GlacialValeTerrain() {
  const groundGeometry = useMemo(() => buildOverlayGeometry(), []);
  const groundMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: makeLightFogUniforms(),
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    transparent: true,
  }), []);
  const waterMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: makeLightFogUniforms(),
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
  }), []);
  const rockMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: makeLightFogUniforms(),
    vertexShader: ROCK_VERT,
    fragmentShader: ROCK_FRAG,
  }), []);
  const rockGeometry = useMemo(() => {
    const base = new THREE.IcosahedronGeometry(1, 3);
    const instanced = new THREE.InstancedBufferGeometry();
    instanced.index = base.index;
    instanced.attributes.position = base.attributes.position;
    instanced.attributes.normal = base.attributes.normal;
    const built = buildBoulderAttributes();
    instanced.setAttribute('aOffset', new THREE.InstancedBufferAttribute(built.offsets, 3));
    instanced.setAttribute('aParam', new THREE.InstancedBufferAttribute(built.params, 4));
    instanced.instanceCount = built.count;
    // world-space attributes: give culling a sphere that covers the vale
    instanced.boundingSphere = new THREE.Sphere(new THREE.Vector3(GLACIAL_VALE.x, 20, GLACIAL_VALE.z), 900);
    return instanced;
  }, []);
  useEffect(() => () => {
    groundGeometry.dispose(); groundMaterial.dispose();
    waterMaterial.dispose(); rockMaterial.dispose(); rockGeometry.dispose();
  }, [groundGeometry, groundMaterial, waterMaterial, rockMaterial, rockGeometry]);
  useValeLightUniforms([groundMaterial, waterMaterial, rockMaterial]);
  return (
    <group>
      <mesh
        geometry={groundGeometry}
        material={groundMaterial}
        position={[GLACIAL_VALE.x, 0, GLACIAL_VALE.z]}
        raycast={() => null}
      />
      <mesh
        position={[GLACIAL_VALE.x, VALE_TARN_WATER_Y + 0.05, GLACIAL_VALE.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={waterMaterial}
        raycast={() => null}
      >
        <circleGeometry args={[240, 72]} />
      </mesh>
      <mesh geometry={rockGeometry} material={rockMaterial} raycast={() => null} />
    </group>
  );
}
