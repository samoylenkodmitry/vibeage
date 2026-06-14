import { useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { FractalBurst } from '../vfx/fractalFx';

/**
 * Shader sandbox (`/showroom.html?scene=fractal`) — a fullscreen raymarched
 * fractal-energy shader (the "absolutely amazing" reference). A staging ground
 * for the flowing-energy look before it's adapted into localised skill effects.
 *
 * `?scene=fractal&mode=burst&color=%238b5cf6` instead renders the LOCALISED
 * `FractalBurst` billboard on a dark floor under the game's bloom/ACES post, so
 * the in-world disc (zoom/density/brightness) can be tuned exactly as it reads
 * inside a skill effect — without the surrounding impact clutter.
 */
const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec2 uRes;
  // Raymarched folding fractal — flowing ribbons of energy. Adapted from a
  // Shadertoy-style loop: a sine-warp fold per step builds the turbulence, and
  // exp(cos()) accumulates an iridescent cyan/violet palette.
  void main() {
    vec4 O = vec4(0.0);
    vec2 I = gl_FragCoord.xy;
    float i = 0.0, t = 0.0, v = 0.0, s, j;
    for (; i++ < 50.0; t += v / 4.0) {
      vec3 p = t * normalize(vec3(I + I, 0.0) - uRes.xyy);
      p.z += 5.0;
      p = reflect(p, normalize(sin(uTime * 0.1 + vec3(0.0, 2.0, 4.0))));
      p = (p.x < p.z ? p.zyx : p);
      s = 1.0;
      for (j = 0.0; j++ < 18.0;) {
        p *= 1.4; s *= 1.4;
        p = (p.y > p.z ? p.xzy : p);
        p.y += 3.0;
        p.xz = vec2(p.z, -p.x - sin(p.y + uTime + i * 0.01));
      }
      v = length(p.xz) / s;
      O += exp(cos(i * 0.08 - vec4(0.0, 1.0, 2.0, 0.0))) / v;
    }
    O = tanh(O / 800.0);
    gl_FragColor = O * O;
  }
`;
const VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function FractalQuad() {
  const { size, viewport } = useThree();
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
  }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
    mat.uniforms.uRes.value.set(size.width * viewport.dpr, size.height * viewport.dpr);
  });
  return <mesh material={mat} frustumCulled={false}><planeGeometry args={[2, 2]} /></mesh>;
}

function BurstSandbox() {
  const params = new URLSearchParams(window.location.search);
  const color = params.get('color') ?? '#a78bfa';
  const size = Number(params.get('size') ?? 4);
  return (
    <Canvas
      camera={{ position: [0, 1.6, 6], fov: 45, near: 0.1, far: 100 }}
      onCreated={({ gl }) => gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))}
    >
      <color attach="background" args={[0.04, 0.05, 0.08]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.6, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#15171d" roughness={1} />
      </mesh>
      <ambientLight intensity={0.4} />
      <group position={[0, 1.6, 0]}><FractalBurst color={color} size={size} /></group>
      <OrbitControls target={[0, 1.6, 0]} enableDamping />
      <EffectComposer enableNormalPass={false} multisampling={0}>
        <Bloom intensity={0.7} luminanceThreshold={0.5} luminanceSmoothing={0.16} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
}

export function FractalTest() {
  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'burst') return <BurstSandbox />;
  return (
    <Canvas onCreated={({ gl }) => gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))}>
      <FractalQuad />
    </Canvas>
  );
}
