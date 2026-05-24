import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DamageNumber } from './DamageNumber';
import type { Vec3, VisualEvent } from './gameTypes';
import { getTerrainY } from './worldSceneConfig';

const RECOVERY_PARTICLES = [
  { angle: 0.15, radius: 0.25, height: 0.25, size: 0.08 },
  { angle: 1.2, radius: 0.45, height: 0.38, size: 0.06 },
  { angle: 2.25, radius: 0.34, height: 0.58, size: 0.09 },
  { angle: 3.4, radius: 0.5, height: 0.44, size: 0.07 },
  { angle: 4.6, radius: 0.3, height: 0.7, size: 0.06 },
  { angle: 5.45, radius: 0.42, height: 0.32, size: 0.08 },
];

export function WorldEventVfx({ event }: { event: VisualEvent }) {
  if (event.kind === 'damage') {
    return <DamagePulseVfx event={event} />;
  }

  if (event.kind === 'healing' || event.kind === 'mana') {
    return <RecoveryVfx event={event} />;
  }

  if (event.kind === 'petrify') {
    return <PetrifyFlashVfx position={event.position} />;
  }

  if (event.kind === 'miss') {
    return <MissVfx event={event} />;
  }

  return <SplashImpactVfx event={event} />;
}

function MissVfx({ event }: { event: VisualEvent }) {
  const matRef = useRef<THREE.SpriteMaterial>(null);
  const startedAtRef = useRef<number | null>(null);
  const spriteRef = useRef<THREE.Sprite>(null);
  const baseY = getTerrainY(event.position.x, event.position.z) + 1.1;
  const texture = useRef<THREE.CanvasTexture | null>(null);
  if (!texture.current) texture.current = buildMissTexture();
  const tex = texture.current;
  const aspect = tex.image.width / tex.image.height;

  useFrame(({ clock }) => {
    if (startedAtRef.current === null) startedAtRef.current = clock.elapsedTime;
    const age = clock.elapsedTime - startedAtRef.current;
    const t = Math.min(1, age / 0.75);
    if (spriteRef.current) {
      // Wobble + rise for a "whiff" feel.
      spriteRef.current.position.y = baseY + t * 0.6;
      spriteRef.current.position.x = Math.sin(age * 12) * 0.08;
    }
    if (matRef.current) {
      matRef.current.opacity = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
    }
  });

  const height = 0.5;
  return (
    <group position={[event.position.x, baseY, event.position.z]}>
      <sprite ref={spriteRef} position={[0, 0, 0]} scale={[height * aspect, height, 1]}>
        <spriteMaterial ref={matRef} map={tex} transparent depthTest={false} depthWrite={false} sizeAttenuation />
      </sprite>
    </group>
  );
}

function buildMissTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);
  const font = '800 64px "Inter", system-ui, -apple-system, sans-serif';
  ctx.font = font;
  const metrics = ctx.measureText('MISS');
  const textWidth = Math.ceil(metrics.width);
  const width = textWidth + 36;
  const height = 88;
  canvas.width = width;
  canvas.height = height;
  ctx.font = font;
  ctx.fillStyle = '#cbd5e1';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 10;
  ctx.fillText('MISS', width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function DamagePulseVfx({ event }: { event: VisualEvent }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const startedAtRef = useRef<number | null>(null);
  const amount = Math.max(1, event.amount ?? 1);
  const scale = THREE.MathUtils.clamp(amount / 35, 0.75, 1.8);

  useFrame(({ clock }) => {
    if (startedAtRef.current === null) {
      startedAtRef.current = clock.elapsedTime;
    }

    const age = Math.max(0, clock.elapsedTime - startedAtRef.current);
    const progress = Math.min(1, age / 0.9);
    const fade = 1 - progress;

    if (ringRef.current) {
      ringRef.current.scale.setScalar(scale + progress * 0.7);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.74 * fade;
    }

    if (flashRef.current) {
      flashRef.current.position.y = 0.45 + progress * 0.55;
      (flashRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * fade;
    }
  });

  return (
    <group position={[event.position.x, getTerrainY(event.position.x, event.position.z) + 0.12, event.position.z]}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.34, 0.52, 36]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={0.74} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={flashRef} position={[0, 0.45, 0]}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshBasicMaterial color="#fff7ad" transparent opacity={0.5} depthWrite={false} />
      </mesh>
      {event.amount !== undefined && event.amount > 0 && (
        <DamageNumber
          amount={event.amount}
          color={event.isCrit ? '#fbbf24' : '#fda4a4'}
          baseY={1.1}
          isCrit={event.isCrit ?? false}
        />
      )}
    </group>
  );
}

function RecoveryVfx({ event }: { event: VisualEvent }) {
  const groupRef = useRef<THREE.Group>(null);
  const startedAtRef = useRef<number | null>(null);
  const color = event.kind === 'mana' ? '#60a5fa' : '#65f28f';
  const baseY = getTerrainY(event.position.x, event.position.z) + 0.2;

  useFrame(({ clock }) => {
    if (startedAtRef.current === null) {
      startedAtRef.current = clock.elapsedTime;
    }

    const age = Math.max(0, clock.elapsedTime - startedAtRef.current);
    const rise = Math.min(1, age / 1.4);
    if (groupRef.current) {
      groupRef.current.position.y = baseY + rise * 0.8;
      groupRef.current.rotation.y += 0.018;
    }
  });

  return (
    <group ref={groupRef} position={[event.position.x, baseY, event.position.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.32, 0.56, 36]} />
        <meshBasicMaterial color={color} transparent opacity={0.58} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {RECOVERY_PARTICLES.map((particle) => (
        <mesh key={`${particle.angle}-${particle.height}`} position={[
          Math.cos(particle.angle) * particle.radius,
          particle.height,
          Math.sin(particle.angle) * particle.radius,
        ]}>
          <sphereGeometry args={[particle.size, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.74} depthWrite={false} />
        </mesh>
      ))}
      {event.amount !== undefined && event.amount > 0 && (
        <DamageNumber amount={event.amount} color={color} baseY={1.0} />
      )}
      <pointLight color={color} intensity={0.9} distance={2.8} />
    </group>
  );
}

function PetrifyFlashVfx({ position }: { position: Vec3 }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const pulse = (Math.sin(clock.elapsedTime * 18) + 1) / 2;
    if (groupRef.current) {
      groupRef.current.scale.setScalar(0.9 + pulse * 0.14);
      groupRef.current.rotation.y += 0.012;
    }
  });

  return (
    <group ref={groupRef} position={[position.x, getTerrainY(position.x, position.z) + 0.7, position.z]}>
      <mesh>
        <dodecahedronGeometry args={[0.62, 0]} />
        <meshStandardMaterial color="#a8a29e" emissive="#78716c" emissiveIntensity={0.48} roughness={0.72} />
      </mesh>
      <mesh scale={1.28}>
        <sphereGeometry args={[0.62, 16, 16]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  );
}

function SplashImpactVfx({ event }: { event: VisualEvent }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const startedAtRef = useRef<number | null>(null);
  const radius = event.radius ?? 1.4;

  useFrame(({ clock }) => {
    if (startedAtRef.current === null) {
      startedAtRef.current = clock.elapsedTime;
    }

    const age = Math.max(0, clock.elapsedTime - startedAtRef.current);
    const progress = Math.min(1, age / 1.1);
    if (ringRef.current) {
      ringRef.current.scale.setScalar(0.5 + progress * radius);
    }

    if (ringMaterialRef.current) {
      ringMaterialRef.current.opacity = 0.62 * (1 - progress);
    }
  });

  return (
    <group position={[event.position.x, getTerrainY(event.position.x, event.position.z) + 0.08, event.position.z]}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.24, 0.42, 48]} />
        <meshBasicMaterial ref={ringMaterialRef} color="#7dd3fc" transparent opacity={0.62} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <pointLight color="#38bdf8" intensity={0.8} distance={4} />
    </group>
  );
}

export function Billboard({ position, children }: { position: [number, number, number]; children: ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ camera }) => {
    groupRef.current?.quaternion.copy(camera.quaternion);
  });

  return (
    <group ref={groupRef} position={position}>
      {children}
    </group>
  );
}
