import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { CastState, type CastSnapshot } from '../../../packages/protocol/messages';
import type { EnemyEntity, GroundLootStack, Vec3 } from './gameTypes';
import { Billboard } from './SceneEventVfx';
import { getTerrainY } from './worldSceneConfig';

type SkillTheme = {
  core: string;
  glow: string;
  accent: string;
  shape: 'sphere' | 'crystal' | 'stone';
};

const SKILL_THEMES: Partial<Record<CastSnapshot['skillId'], SkillTheme>> = {
  fireball: { core: '#ff6a1a', glow: '#f97316', accent: '#facc15', shape: 'sphere' },
  iceBolt: { core: '#bfdbfe', glow: '#60a5fa', accent: '#67e8f9', shape: 'crystal' },
  waterSplash: { core: '#7dd3fc', glow: '#38bdf8', accent: '#8de9d7', shape: 'sphere' },
  petrify: { core: '#d6d3d1', glow: '#a8a29e', accent: '#facc15', shape: 'stone' },
  smite: { core: '#fef9c3', glow: '#facc15', accent: '#fde68a', shape: 'sphere' },
  arrowShot: { core: '#bbf7d0', glow: '#22c55e', accent: '#86efac', shape: 'crystal' },
  volley: { core: '#bbf7d0', glow: '#16a34a', accent: '#86efac', shape: 'crystal' },
  poisonBlade: { core: '#a7f3d0', glow: '#10b981', accent: '#86efac', shape: 'crystal' },
  holyLight: { core: '#fef9c3', glow: '#fef08a', accent: '#fff7ad', shape: 'sphere' },
};

const DEFAULT_SKILL_THEME: SkillTheme = {
  core: '#fde68a',
  glow: '#fbbf24',
  accent: '#fde68a',
  shape: 'sphere',
};

const LOOT_SPARKS = [
  { angle: 0.2, height: 0.28, radius: 0.72 },
  { angle: 1.7, height: 0.45, radius: 0.58 },
  { angle: 3.1, height: 0.34, radius: 0.68 },
  { angle: 4.6, height: 0.52, radius: 0.5 },
];

const PROJECTILE_TRAIL_POINTS = [
  { offset: 0.38, radius: 0.16, opacity: 0.48, drift: 0.03 },
  { offset: 0.74, radius: 0.12, opacity: 0.36, drift: -0.04 },
  { offset: 1.06, radius: 0.09, opacity: 0.28, drift: 0.05 },
  { offset: 1.34, radius: 0.07, opacity: 0.2, drift: -0.02 },
];

/**
 * PR Q — Boss signature telegraph. A ring on the ground that grows
 * from a thin inner stroke to the impact radius over windUpMs, then
 * flashes red briefly when the impact lands. Pure visual; damage
 * application is server-authoritative via EnemyAttack messages.
 */
export function BossTelegraphRing({
  x, z, radius, startedAt, impactAt,
}: { x: number; z: number; radius: number; startedAt: number; impactAt: number }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const totalMs = Math.max(1, impactAt - startedAt);

  useFrame(() => {
    const ring = ringRef.current;
    const flash = meshRef.current;
    if (!ring || !flash) return;
    const now = Date.now();
    if (now < impactAt) {
      const progress = Math.min(1, (now - startedAt) / totalMs);
      ring.scale.setScalar(0.2 + progress * 0.8);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + progress * 0.5;
      (flash.material as THREE.MeshBasicMaterial).opacity = 0;
    } else {
      const sincePost = now - impactAt;
      ring.scale.setScalar(1);
      (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - sincePost / 600);
      (flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.6 - sincePost / 600);
    }
  });

  return (
    <group position={[x, getTerrainY(x, z) + 0.04, z]}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[Math.max(0.1, radius - 0.3), radius, 64]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 64]} />
        <meshBasicMaterial color="#fb923c" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function TargetDestinationMarker({ target }: { target: Vec3 | null }) {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    const beam = beamRef.current;
    if (!outer || !inner || !beam) {
      return;
    }

    const pulse = (Math.sin(clock.elapsedTime * 7) + 1) / 2;
    outer.scale.setScalar(1 + pulse * 0.28);
    inner.scale.setScalar(0.76 + pulse * 0.1);
    (outer.material as THREE.MeshBasicMaterial).opacity = 0.34 + pulse * 0.38;
    (inner.material as THREE.MeshBasicMaterial).opacity = 0.72 + pulse * 0.18;
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.2 + pulse * 0.24;
  });

  if (!target) {
    return null;
  }

  return (
    <group position={[target.x, getTerrainY(target.x, target.z) + 0.05, target.z]}>
      <mesh ref={outerRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.54, 0.76, 42]} />
        <meshBasicMaterial color="#8de9d7" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={innerRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.26, 28]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.86} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={beamRef} position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.04, 0.08, 1.04, 12]} />
        <meshBasicMaterial color="#8de9d7" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function CastVfx({ snapshot }: { snapshot: CastSnapshot }) {
  const theme = SKILL_THEMES[snapshot.skillId] ?? DEFAULT_SKILL_THEME;
  const progress = Math.min(1, snapshot.progressMs / Math.max(1, snapshot.castTimeMs));

  if (snapshot.state === CastState.Impact) {
    return <ImpactVfx theme={theme} />;
  }

  if (snapshot.state === CastState.Casting) {
    return <CastingChargeVfx progress={progress} theme={theme} />;
  }

  return <ProjectileVfx dir={snapshot.dir} theme={theme} />;
}

function CastingChargeVfx({ progress, theme }: { progress: number; theme: SkillTheme }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, delta) => {
    const pulse = (Math.sin(clock.elapsedTime * 9) + 1) / 2;
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 2.2;
      ringRef.current.scale.setScalar(0.7 + progress * 0.65 + pulse * 0.05);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.42 + progress * 0.36;
    }

    if (coreRef.current) {
      coreRef.current.scale.setScalar(0.32 + progress * 0.44 + pulse * 0.05);
    }
  });

  return (
    <group>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.92, 0]}>
        <ringGeometry args={[0.72, 0.94, 44]} />
        <meshBasicMaterial color={theme.accent} transparent opacity={0.58} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.44, 1]} />
        <meshStandardMaterial color={theme.core} emissive={theme.glow} emissiveIntensity={0.7} roughness={0.35} />
      </mesh>
    </group>
  );
}

function ProjectileVfx({ dir, theme }: { dir: CastSnapshot['dir']; theme: SkillTheme }) {
  const coreRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const yaw = Math.atan2(dir?.x ?? 0, dir?.z ?? 1);

  useFrame(({ clock }, delta) => {
    const pulse = 1 + Math.sin(clock.elapsedTime * 14) * 0.08;
    if (coreRef.current) {
      coreRef.current.rotation.x += delta * 3;
      coreRef.current.rotation.z += delta * 4;
      coreRef.current.scale.setScalar(pulse);
    }

    if (haloRef.current) {
      (haloRef.current.material as THREE.MeshBasicMaterial).opacity = 0.28 + (pulse - 0.92) * 0.8;
    }
  });

  return (
    <group rotation={[0, yaw, 0]}>
      {renderProjectileCore(theme, coreRef)}
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.58, 18, 18]} />
        <meshBasicMaterial color={theme.glow} transparent opacity={0.34} depthWrite={false} />
      </mesh>
      {[0.52, 0.92, 1.28].map((offset, index) => (
        <mesh key={offset} position={[0, 0, -offset]} scale={1 - index * 0.2}>
          <sphereGeometry args={[0.2, 10, 10]} />
          <meshBasicMaterial color={theme.accent} transparent opacity={0.36 - index * 0.08} depthWrite={false} />
        </mesh>
      ))}
      <ProjectileTrail theme={theme} />
    </group>
  );
}

function ProjectileTrail({ theme }: { theme: SkillTheme }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(clock.elapsedTime * 8) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {PROJECTILE_TRAIL_POINTS.map((point, index) => (
        <mesh key={point.offset} position={[point.drift, Math.sin(index) * 0.05, -point.offset]}>
          <sphereGeometry args={[point.radius, 8, 8]} />
          <meshBasicMaterial color={theme.glow} transparent opacity={point.opacity} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function ImpactVfx({ theme }: { theme: SkillTheme }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const startedAtRef = useRef(0);

  useFrame(({ clock }) => {
    if (!startedAtRef.current) {
      startedAtRef.current = clock.elapsedTime;
    }

    const age = Math.min(1.8, clock.elapsedTime - startedAtRef.current);
    const fade = Math.max(0, 1 - age / 1.8);

    if (ringRef.current) {
      ringRef.current.scale.setScalar(0.85 + age * 1.35);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.64 * fade;
    }

    if (flashRef.current) {
      flashRef.current.scale.setScalar(1.1 + age * 0.32);
      (flashRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * fade;
    }
  });

  return (
    <group>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.92, 0]}>
        <ringGeometry args={[0.4, 0.88, 48]} />
        <meshBasicMaterial color={theme.accent} transparent opacity={0.64} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={flashRef}>
        <sphereGeometry args={[0.78, 18, 18]} />
        <meshBasicMaterial color={theme.glow} transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  );
}

function renderProjectileCore(theme: SkillTheme, ref: RefObject<THREE.Mesh | null>): ReactNode {
  const material = (
    <meshStandardMaterial color={theme.core} emissive={theme.glow} emissiveIntensity={0.72} roughness={0.28} metalness={0.12} />
  );

  if (theme.shape === 'crystal') {
    return (
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.34, 1]} />
        {material}
      </mesh>
    );
  }

  if (theme.shape === 'stone') {
    return (
      <mesh ref={ref}>
        <dodecahedronGeometry args={[0.36, 0]} />
        {material}
      </mesh>
    );
  }

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.36, 18, 18]} />
      {material}
    </mesh>
  );
}

export function LootMarker({
  loot,
  onPickUpLoot,
}: {
  loot: GroundLootStack;
  onPickUpLoot: (lootId: string) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const sparkGroupRef = useRef<THREE.Group>(null);
  const color = loot.items.length > 1 ? '#facc15' : '#eab308';
  const sparks = useMemo(() => LOOT_SPARKS, []);

  useFrame(({ clock }, delta) => {
    if (meshRef.current) {
      meshRef.current.position.y = Math.sin(clock.elapsedTime * 2.4) * 0.08;
      meshRef.current.rotation.y += delta * 1.4;
    }

    if (sparkGroupRef.current) {
      sparkGroupRef.current.rotation.y += delta * 1.1;
    }
  });

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    onPickUpLoot(loot.id);
  }

  return (
    <group position={[loot.position.x, getTerrainY(loot.position.x, loot.position.z) + 0.42, loot.position.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.38, 0]}>
        <ringGeometry args={[0.62, 0.8, 28]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={meshRef} castShadow onPointerDown={handlePointerDown}>
        <boxGeometry args={[0.62, 0.62, 0.62]} />
        <meshStandardMaterial color={color} emissive="#7c4a03" emissiveIntensity={0.75} roughness={0.48} />
      </mesh>
      <group ref={sparkGroupRef}>
        {sparks.map((spark) => (
          <mesh
            key={spark.angle}
            position={[
              Math.cos(spark.angle) * spark.radius,
              spark.height,
              Math.sin(spark.angle) * spark.radius,
            ]}
          >
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshBasicMaterial color="#fff7ad" transparent opacity={0.78} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function SelectedEnemyRing() {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const pulse = (Math.sin(clock.elapsedTime * 6.5) + 1) / 2;
    if (outerRef.current) {
      outerRef.current.scale.setScalar(1 + pulse * 0.08);
      (outerRef.current.material as THREE.MeshBasicMaterial).opacity = 0.72 + pulse * 0.2;
    }

    if (innerRef.current) {
      innerRef.current.rotation.z -= 0.012;
    }
  });

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]}>
      <mesh ref={outerRef}>
        <ringGeometry args={[1.05, 1.25, 54]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.86} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={innerRef}>
        <ringGeometry args={[0.78, 0.86, 6]} />
        <meshBasicMaterial color="#8de9d7" transparent opacity={0.62} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function SelectedEnemyBeacon() {
  const haloRef = useRef<THREE.Mesh>(null);
  const pointerRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, delta) => {
    const pulse = (Math.sin(clock.elapsedTime * 5.5) + 1) / 2;
    if (haloRef.current) {
      haloRef.current.rotation.z += delta * 1.8;
      (haloRef.current.material as THREE.MeshBasicMaterial).opacity = 0.38 + pulse * 0.24;
    }

    if (pointerRef.current) {
      pointerRef.current.position.y = 1.52 + pulse * 0.12;
      pointerRef.current.rotation.y += delta * 2.4;
    }
  });

  return (
    <group>
      <mesh ref={haloRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.32, 0]}>
        <ringGeometry args={[0.42, 0.58, 36]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={pointerRef} position={[0, 1.58, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.22, 0.42, 4]} />
        <meshStandardMaterial color="#facc15" emissive="#8a5f00" emissiveIntensity={0.58} roughness={0.42} />
      </mesh>
    </group>
  );
}

export function EnemyThreatRing({ state }: { state?: string }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const isAttacking = state === 'attacking';
  const color = isAttacking ? '#fb7185' : '#f59e0b';

  useFrame(({ clock }) => {
    const ring = ringRef.current;
    if (!ring) {
      return;
    }

    const pulse = (Math.sin(clock.elapsedTime * (isAttacking ? 8 : 4.8)) + 1) / 2;
    ring.scale.setScalar(0.95 + pulse * (isAttacking ? 0.14 : 0.08));
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.34 + pulse * (isAttacking ? 0.34 : 0.18);
  });

  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <ringGeometry args={[0.9, 1.04, 44]} />
      <meshBasicMaterial color={color} transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

export function EnemyHitFlash({ health }: { health: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const previousHealthRef = useRef(health);
  const flashSecondsRef = useRef(0);

  useEffect(() => {
    if (health < previousHealthRef.current) {
      flashSecondsRef.current = 0.22;
    }

    previousHealthRef.current = health;
  }, [health]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    flashSecondsRef.current = Math.max(0, flashSecondsRef.current - delta);
    const opacity = flashSecondsRef.current / 0.22;
    (mesh.material as THREE.MeshBasicMaterial).opacity = opacity * 0.48;
  });

  return (
    <mesh ref={meshRef} scale={[1.22, 1.18, 1.22]}>
      <boxGeometry args={[1.05, 1.1, 1.05]} />
      <meshBasicMaterial color="#fff7ad" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export function EnemyHealthBar({ enemy, visible }: { enemy: EnemyEntity; visible: boolean }) {
  const width = 1.7;
  const healthRatio = THREE.MathUtils.clamp(enemy.health / Math.max(1, enemy.maxHealth), 0, 1);

  if (!visible) {
    return null;
  }

  return (
    <Billboard position={[0, 1.15, 0]}>
      <mesh position={[0, 0, -0.002]}>
        <planeGeometry args={[width, 0.18]} />
        <meshBasicMaterial color="#111827" transparent opacity={0.86} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={[-(width * (1 - healthRatio)) / 2, 0, 0]}>
        <planeGeometry args={[width * healthRatio, 0.1]} />
        <meshBasicMaterial color={healthRatio > 0.35 ? '#86efac' : '#fb7185'} depthTest={false} depthWrite={false} />
      </mesh>
    </Billboard>
  );
}
