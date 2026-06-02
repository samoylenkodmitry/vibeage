import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GlowEmitter } from '../dynamicLights';

const DOME_COLOR = '#a78bfa';
const RIM_COLOR = '#67e8f9';
const FLOOR_COLOR = '#312e81';
const BAND_COUNT = 4;

export function TimeSphereDome({ radius, durationMs }: { radius: number; durationMs: number }) {
  const rootRef = useRef<THREE.Group>(null);
  const domeRef = useRef<THREE.Mesh>(null);
  const rimRef = useRef<THREE.Mesh>(null);
  const floorRef = useRef<THREE.Mesh>(null);
  const startedAtRef = useRef(Date.now());

  useFrame(({ clock }) => {
    const elapsedMs = Date.now() - startedAtRef.current;
    const fade = timeSphereFade(elapsedMs, durationMs);
    const pulse = (Math.sin(clock.elapsedTime * 3.6) + 1) / 2;
    const root = rootRef.current;
    if (root) {
      const entrance = Math.min(1, elapsedMs / 220);
      root.scale.setScalar(0.86 + entrance * 0.14 + pulse * 0.006);
    }

    setOpacity(domeRef.current, (0.18 + pulse * 0.055) * fade);
    setOpacity(rimRef.current, (0.66 + pulse * 0.22) * fade);
    setOpacity(floorRef.current, (0.13 + pulse * 0.035) * fade);

    root?.children.forEach((child, index) => {
      if (child.userData.kind !== 'timeSphereBand') {
        return;
      }
      child.rotation.y = clock.elapsedTime * (0.18 + index * 0.035);
      setOpacity(child as THREE.Mesh, (0.18 + pulse * 0.07) * fade);
    });
  });

  return (
    <group ref={rootRef} position={[0, -1, 0]}>
      <mesh
        ref={floorRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.018, 0]}
        scale={[radius, radius, 1]}
        raycast={() => null}
      >
        <circleGeometry args={[1, 96]} />
        <meshBasicMaterial color={FLOOR_COLOR} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={domeRef} scale={radius} raycast={() => null}>
        <sphereGeometry args={[1, 72, 28, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial
          color={DOME_COLOR}
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh
        ref={rimRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.04, 0]}
        scale={[radius, radius, 1]}
        raycast={() => null}
      >
        <ringGeometry args={[0.965, 1.035, 128]} />
        <meshBasicMaterial
          color={RIM_COLOR}
          transparent
          opacity={0.76}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {Array.from({ length: BAND_COUNT }, (_, index) => (
        <TimeSphereLatitudeBand key={index} radius={radius} index={index} />
      ))}
      <GlowEmitter color={DOME_COLOR} intensity={2.3} distance={radius * 2.3} priority={4} />
    </group>
  );
}

function TimeSphereLatitudeBand({ radius, index }: { radius: number; index: number }) {
  const fraction = (index + 1) / (BAND_COUNT + 1);
  const y = Math.sin(fraction * Math.PI * 0.5) * radius;
  const bandRadius = Math.cos(fraction * Math.PI * 0.5);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, y, 0]}
      scale={[radius, radius, 1]}
      raycast={() => null}
      userData={{ kind: 'timeSphereBand' }}
    >
      <ringGeometry args={[Math.max(0.02, bandRadius - 0.015), bandRadius + 0.015, 96]} />
      <meshBasicMaterial
        color={index % 2 === 0 ? DOME_COLOR : RIM_COLOR}
        transparent
        opacity={0.18}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function timeSphereFade(elapsedMs: number, durationMs: number): number {
  const enter = Math.min(1, elapsedMs / 220);
  if (elapsedMs <= durationMs) {
    return enter;
  }
  return Math.max(0, 1 - (elapsedMs - durationMs) / 500);
}

function setOpacity(mesh: THREE.Mesh | null | undefined, opacity: number): void {
  if (!mesh) {
    return;
  }
  const material = mesh.material as THREE.MeshBasicMaterial;
  material.opacity = opacity;
  mesh.visible = opacity > 0.01;
}
