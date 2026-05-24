import { useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { ITEMS } from '../../../packages/content/items';

/**
 * Player avatar rendering — the capsule figure, walk animation, and
 * equipment overlays. Extracted from WorldEntities.tsx (which had hit
 * its 700-line maintainability ceiling); only PlayerFigure is consumed
 * outside this cluster (by PlayerMarker), everything else is internal.
 */

type PlayerAnimationRefs = {
  group: THREE.Group | null;
  leftLeg: THREE.Mesh | null;
  rightLeg: THREE.Mesh | null;
  torso: THREE.Mesh | null;
  torsoHeight: number;
  legPivotY: number;
  isMoving: boolean;
  isAlive: boolean;
};

type WalkBlendState = { value: number };

function makeWalkBlend(): WalkBlendState {
  return { value: 0 };
}

function drivePlayerAnimation(
  time: number,
  delta: number,
  blend: WalkBlendState,
  refs: PlayerAnimationRefs,
): void {
  const { group, leftLeg, rightLeg, torso, torsoHeight, legPivotY, isMoving, isAlive } = refs;
  if (!group) {
    return;
  }
  if (!isAlive) {
    blend.value = 0;
    group.position.y = -torsoHeight * 0.4;
    group.rotation.x = -Math.PI / 2;
    return;
  }
  group.rotation.x = 0;

  const target = isMoving ? 1 : 0;
  const blendSpeed = isMoving ? 6 : 4;
  blend.value += (target - blend.value) * Math.min(1, delta * blendSpeed);
  const w = blend.value;

  const swing = Math.sin(time * 7.4);
  const idleBob = Math.sin(time * 2.2) * 0.03;
  group.position.y = idleBob * (1 - w);

  if (leftLeg) {
    leftLeg.position.set(-0.32, legPivotY, swing * 0.32 * w);
    leftLeg.rotation.x = swing * 0.45 * w;
  }
  if (rightLeg) {
    rightLeg.position.set(0.32, legPivotY, -swing * 0.32 * w);
    rightLeg.rotation.x = -swing * 0.45 * w;
  }
  if (torso) {
    torso.rotation.z = Math.sin(time * 7.4 + Math.PI) * 0.04 * w;
  }
}

export function PlayerFigure({
  height,
  torsoHeight,
  headRadius,
  color,
  isSelf,
  isAlive,
  isMoving,
  equipment,
  onPointerDown,
}: {
  height: number;
  torsoHeight: number;
  headRadius: number;
  color: string;
  isSelf: boolean;
  isAlive: boolean;
  isMoving: boolean;
  equipment?: Record<string, string>;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const torsoRef = useRef<THREE.Mesh>(null);
  const blendRef = useRef<WalkBlendState>(makeWalkBlend());
  const cloakColor = isSelf ? '#1f2937' : '#374151';
  const skinColor = '#f5d9b8';
  const trimColor = isSelf ? '#facc15' : '#94a3b8';
  const torsoY = height * 0.45;
  const cloakY = torsoY - torsoHeight * 0.18;
  const headY = torsoY + torsoHeight * 0.5 + headRadius * 0.55;
  const ringY = torsoY + torsoHeight * 0.55 + headRadius * 1.65;
  const legPivotY = 0.55;

  useFrame(({ clock }, delta) => {
    drivePlayerAnimation(clock.elapsedTime, delta, blendRef.current, {
      group: groupRef.current,
      leftLeg: leftLegRef.current,
      rightLeg: rightLegRef.current,
      torso: torsoRef.current,
      torsoHeight,
      legPivotY,
      isMoving,
      isAlive,
    });
  });

  return (
    <group ref={groupRef} onPointerDown={onPointerDown}>
      <mesh ref={leftLegRef} position={[-0.32, legPivotY, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.42, 6, 10]} />
        <meshStandardMaterial color={cloakColor} roughness={0.78} />
      </mesh>
      <mesh ref={rightLegRef} position={[0.32, legPivotY, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.42, 6, 10]} />
        <meshStandardMaterial color={cloakColor} roughness={0.78} />
      </mesh>
      <mesh ref={torsoRef} position={[0, torsoY, 0]} castShadow>
        <capsuleGeometry args={[0.4, torsoHeight, 8, 14]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.16} />
        {/* Chest armour rides on the torso so it tilts with the walk sway. */}
        {isAlive && equipment?.CHEST && (
          <mesh>
            <capsuleGeometry args={[0.46, torsoHeight * 0.9, 8, 14]} />
            <meshStandardMaterial color={templateColor(equipment.CHEST, '#7c2d12')} roughness={0.45} metalness={0.32} transparent opacity={0.92} />
          </mesh>
        )}
      </mesh>
      <mesh position={[0, cloakY, -0.12]} castShadow>
        <coneGeometry args={[0.78, torsoHeight * 1.05, 14, 1, true]} />
        <meshStandardMaterial color={cloakColor} roughness={0.82} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, torsoY + torsoHeight * 0.46, 0]} castShadow>
        <torusGeometry args={[0.46, 0.06, 8, 18]} />
        <meshStandardMaterial color={trimColor} roughness={0.42} metalness={0.36} />
      </mesh>
      <mesh position={[0, headY, 0]} castShadow>
        <sphereGeometry args={[headRadius, 18, 14]} />
        <meshStandardMaterial color={skinColor} roughness={0.62} />
      </mesh>
      {isSelf && (
        <mesh position={[0, ringY, 0]}>
          <torusGeometry args={[0.62, 0.04, 8, 36]} />
          <meshStandardMaterial color="#facc15" emissive="#8a5f00" emissiveIntensity={0.55} />
        </mesh>
      )}
      {isAlive && equipment && (
        <EquipmentOverlay
          equipment={equipment}
          torsoY={torsoY}
          torsoHeight={torsoHeight}
          headY={headY}
          headRadius={headRadius}
        />
      )}
    </group>
  );
}

function EquipmentOverlay({
  equipment,
  torsoY,
  torsoHeight,
  headY,
  headRadius,
}: {
  equipment: Record<string, string>;
  torsoY: number;
  torsoHeight: number;
  headY: number;
  headRadius: number;
}) {
  const helmetColor = templateColor(equipment.HEAD, '#a8a29e');
  const mainHand = equipment.MAIN_HAND;
  const offHand = equipment.OFF_HAND;
  const handY = torsoY - torsoHeight * 0.1;
  return (
    <group>
      {equipment.HEAD && (
        <mesh position={[0, headY + headRadius * 0.4, 0]} castShadow>
          <sphereGeometry args={[headRadius * 1.18, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={helmetColor} roughness={0.4} metalness={0.5} />
        </mesh>
      )}
      {mainHand && (
        <WeaponMesh templateId={mainHand} y={handY} x={0.45} hand="main" />
      )}
      {offHand && (
        offHandIsShield(offHand)
          ? <ShieldMesh templateId={offHand} y={torsoY} x={-0.48} />
          : <WeaponMesh templateId={offHand} y={handY} x={-0.45} hand="off" />
      )}
    </group>
  );
}

function WeaponMesh({ templateId, y, x, hand }: { templateId: string; y: number; x: number; hand: 'main' | 'off' }) {
  const template = ITEMS[templateId];
  const handUsage = template?.equip?.handUsage;
  const weaponType = template?.equip?.weaponType ?? 'sword';
  const color = templateColor(templateId, '#94a3b8');
  const isOrb = weaponType === 'staff' || weaponType === 'orb';
  const isTwoHanded = handUsage === 'twoHand' || handUsage === 'bow' || handUsage === 'dualWield';
  const length = isOrb || isTwoHanded ? 1.6 : 1.0;
  const radius = weaponType === 'mace' ? 0.07 : weaponType === 'dagger' ? 0.04 : 0.05;
  // Swords / daggers / staves taper toward the tip; maces flare outward.
  const radiusTop = weaponType === 'mace' ? radius : radius * 0.6;
  const radiusBottom = weaponType === 'mace' ? radius * 0.8 : radius;
  const angle = hand === 'main' ? -0.35 : 0.35;
  return (
    <group position={[x, y, 0.1]} rotation={[0, 0, angle]}>
      <mesh position={[0, length / 2, 0]} castShadow>
        <cylinderGeometry args={[radiusTop, radiusBottom, length, 10]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.6} />
      </mesh>
      {weaponType === 'mace' && (
        <mesh position={[0, length, 0]} castShadow>
          <icosahedronGeometry args={[0.16, 0]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.7} />
        </mesh>
      )}
      {isOrb && (
        <mesh position={[0, length, 0]} castShadow>
          <sphereGeometry args={[0.14, 12, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
        </mesh>
      )}
    </group>
  );
}

function ShieldMesh({ templateId, y, x }: { templateId: string; y: number; x: number }) {
  const color = templateColor(templateId, '#9a5b2c');
  return (
    <mesh position={[x, y, 0.15]} rotation={[0, Math.PI / 2, 0]} castShadow>
      <cylinderGeometry args={[0.32, 0.32, 0.08, 18]} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.4} />
    </mesh>
  );
}

function offHandIsShield(templateId: string): boolean {
  const spec = ITEMS[templateId]?.equip;
  return spec?.bodyPart === 'shield';
}

function templateColor(templateId: string | undefined, fallback: string): string {
  if (!templateId) return fallback;
  // Future: read from ItemTemplate.visual once it's added. For now, derive a
  // stable colour from the item grade so different grades read differently.
  const grade = ITEMS[templateId]?.grade ?? 'none';
  switch (grade) {
    case 'd': return '#9ca3af';
    case 'c': return '#86efac';
    case 'b': return '#7dd3fc';
    case 'a': return '#fde68a';
    case 's': return '#fca5a5';
    default: return fallback;
  }
}
