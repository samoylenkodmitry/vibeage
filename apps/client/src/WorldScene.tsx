import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { CastState, type VecXZ } from '../../../packages/protocol/messages';
import type {
  EnemyEntity,
  GameClientState,
  GroundLootStack,
  PlayerEntity,
  Vec3,
  VisibleCast,
} from './gameTypes';

const GROUND_Y = 0;
const reusableTargetVector = new THREE.Vector3();

type WorldSceneProps = {
  state: GameClientState;
  onMove: (target: VecXZ) => void;
  onSelectTarget: (targetId: string | null) => void;
  onPickUpLoot: (lootId: string) => void;
};

export function WorldScene({ state, onMove, onSelectTarget, onPickUpLoot }: WorldSceneProps) {
  const myPlayer = state.myPlayerId ? state.players[state.myPlayerId] ?? null : null;
  const focus = myPlayer?.position ?? { x: 0, y: 0.5, z: 0 };
  const cameraAnchorRef = useRef<THREE.Vector3 | null>(null) as MutableRefObject<THREE.Vector3 | null>;

  return (
    <Canvas
      camera={{ position: [0, 18, 22], fov: 55, near: 0.1, far: 600 }}
      onCreated={({ gl }) => {
        gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      }}
    >
      <color attach="background" args={['#071015']} />
      <fog attach="fog" args={['#071015', 70, 210]} />
      <ambientLight intensity={0.62} />
      <directionalLight position={[24, 32, 18]} intensity={1.4} castShadow />
      <WorldGround onMove={onMove} />
      <TargetDestination target={state.targetWorldPos} />
      {Object.values(state.players).map((player) => (
        <PlayerMarker
          key={player.id}
          player={player}
          isSelf={player.id === state.myPlayerId}
          presentationRef={player.id === state.myPlayerId ? cameraAnchorRef : undefined}
        />
      ))}
      {Object.values(state.enemies).map((enemy) => (
        <EnemyMarker
          key={enemy.id}
          enemy={enemy}
          isSelected={enemy.id === state.selectedTargetId}
          onSelect={onSelectTarget}
        />
      ))}
      {Object.values(state.groundLoot).map((loot) => (
        <LootMarker key={loot.id} loot={loot} onPickUpLoot={onPickUpLoot} />
      ))}
      {Object.values(state.casts).map((cast) => (
        <CastMarker key={cast.snapshot.castId} cast={cast} />
      ))}
      <CameraRig focus={focus} presentationFocusRef={cameraAnchorRef} />
    </Canvas>
  );
}

function WorldGround({ onMove }: { onMove: (target: VecXZ) => void }) {
  const grid = useMemo(() => new THREE.GridHelper(220, 44, '#6ee7d8', '#253f47'), []);

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    onMove({ x: event.point.x, z: event.point.z });
  }

  return (
    <group>
      <primitive object={grid} position={[0, GROUND_Y + 0.01, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerDown={handlePointerDown}>
        <planeGeometry args={[240, 240]} />
        <meshStandardMaterial color="#10252a" roughness={0.96} metalness={0.05} />
      </mesh>
    </group>
  );
}

function PlayerMarker({
  player,
  isSelf,
  presentationRef,
}: {
  player: PlayerEntity;
  isSelf: boolean;
  presentationRef?: MutableRefObject<THREE.Vector3 | null>;
}) {
  const color = player.isAlive ? (isSelf ? '#75f5c8' : '#8bb5ff') : '#64748b';
  const height = isSelf ? 1.8 : 1.55;

  return (
    <SmoothedEntityGroup
      position={{ x: player.position.x, y: GROUND_Y + height / 2, z: player.position.z }}
      rotationY={player.rotation?.y ?? 0}
      response={isSelf ? 16 : 10}
      presentationRef={presentationRef}
    >
      <mesh castShadow>
        <capsuleGeometry args={[0.48, height - 0.8, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.48} metalness={0.12} />
      </mesh>
      {isSelf && (
        <mesh position={[0, height * 0.65, 0]}>
          <torusGeometry args={[0.72, 0.035, 8, 36]} />
          <meshStandardMaterial color="#facc15" emissive="#8a5f00" emissiveIntensity={0.5} />
        </mesh>
      )}
    </SmoothedEntityGroup>
  );
}

function EnemyMarker({
  enemy,
  isSelected,
  onSelect,
}: {
  enemy: EnemyEntity;
  isSelected: boolean;
  onSelect: (targetId: string | null) => void;
}) {
  const color = enemy.isAlive ? '#ef6461' : '#4b5563';
  const y = enemy.isAlive ? GROUND_Y + 0.55 : GROUND_Y + 0.1;

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0 || !enemy.isAlive) {
      return;
    }

    event.stopPropagation();
    onSelect(enemy.id);
  }

  return (
    <SmoothedEntityGroup
      position={{ x: enemy.position.x, y, z: enemy.position.z }}
      rotationY={enemy.rotation?.y ?? 0}
      response={9}
    >
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]}>
          <ringGeometry args={[1.05, 1.24, 42]} />
          <meshBasicMaterial color="#facc15" side={THREE.DoubleSide} />
        </mesh>
      )}
      <mesh castShadow onPointerDown={handlePointerDown}>
        <boxGeometry args={[1.05, enemy.isAlive ? 1.1 : 0.25, 1.05]} />
        <meshStandardMaterial color={color} roughness={0.82} />
      </mesh>
    </SmoothedEntityGroup>
  );
}

function TargetDestination({ target }: { target: Vec3 | null }) {
  if (!target) {
    return null;
  }

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[target.x, GROUND_Y + 0.04, target.z]}>
      <ringGeometry args={[0.5, 0.68, 36]} />
      <meshBasicMaterial color="#8de9d7" side={THREE.DoubleSide} />
    </mesh>
  );
}

function CastMarker({ cast }: { cast: VisibleCast }) {
  const snapshot = cast.snapshot;
  const color = snapshot.state === CastState.Impact ? '#f97316' : '#facc15';
  const scale = snapshot.state === CastState.Impact ? 1.25 : 0.58;

  return (
    <SmoothedEntityGroup position={{ x: snapshot.pos.x, y: GROUND_Y + 1, z: snapshot.pos.z }} response={18}>
      <mesh scale={scale}>
        <sphereGeometry args={[0.42, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.65} />
      </mesh>
    </SmoothedEntityGroup>
  );
}

function LootMarker({
  loot,
  onPickUpLoot,
}: {
  loot: GroundLootStack;
  onPickUpLoot: (lootId: string) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = loot.items.length > 1 ? '#facc15' : '#eab308';

  useFrame(({ clock }) => {
    if (!meshRef.current) {
      return;
    }

    meshRef.current.position.y = Math.sin(clock.elapsedTime * 2.4) * 0.08;
    meshRef.current.rotation.y += 0.018;
  });

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    onPickUpLoot(loot.id);
  }

  return (
    <group position={[loot.position.x, GROUND_Y + 0.42, loot.position.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.38, 0]}>
        <ringGeometry args={[0.62, 0.8, 28]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={meshRef} castShadow onPointerDown={handlePointerDown}>
        <boxGeometry args={[0.62, 0.62, 0.62]} />
        <meshStandardMaterial color={color} emissive="#7c4a03" emissiveIntensity={0.75} roughness={0.48} />
      </mesh>
    </group>
  );
}

function SmoothedEntityGroup({
  position,
  rotationY = 0,
  response,
  children,
  presentationRef,
}: {
  position: Vec3;
  rotationY?: number;
  response: number;
  children: ReactNode;
  presentationRef?: MutableRefObject<THREE.Vector3 | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    const group = groupRef.current;
    if (presentationRef && group) {
      presentationRef.current = group.position;
    }

    return () => {
      if (presentationRef?.current === group?.position) {
        presentationRef.current = null;
      }
    };
  }, [presentationRef]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    if (!hasInitializedRef.current) {
      group.position.set(position.x, position.y, position.z);
      group.rotation.y = rotationY;
      hasInitializedRef.current = true;
      return;
    }

    const alpha = 1 - Math.exp(-response * delta);
    group.position.lerp(targetVector(position), alpha);
    group.rotation.y = lerpAngle(group.rotation.y, rotationY, alpha);
  });

  return <group ref={groupRef}>{children}</group>;
}

function CameraRig({
  focus,
  presentationFocusRef,
}: {
  focus: Vec3;
  presentationFocusRef: MutableRefObject<THREE.Vector3 | null>;
}) {
  const { camera, gl } = useThree();
  const angleRef = useRef(Math.PI * 0.82);
  const pitchRef = useRef(0.46);
  const draggingRef = useRef(false);
  const focusRef = useRef(new THREE.Vector3(focus.x, GROUND_Y + 1.4, focus.z));
  const lastPointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = gl.domElement;
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 2) {
        return;
      }

      draggingRef.current = true;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!draggingRef.current) {
        return;
      }

      angleRef.current -= (event.clientX - lastPointerRef.current.x) * 0.012;
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current + (event.clientY - lastPointerRef.current.y) * 0.01,
        0.14,
        0.95,
      );
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = () => {
      draggingRef.current = false;
    };

    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const distance = 24;
    const presentationFocus = presentationFocusRef.current;
    const targetFocus = targetVector({
      x: presentationFocus?.x ?? focus.x,
      y: GROUND_Y + 1.4,
      z: presentationFocus?.z ?? focus.z,
    });
    focusRef.current.lerp(targetFocus, 1 - Math.exp(-8 * delta));

    const centerX = focusRef.current.x;
    const centerY = focusRef.current.y;
    const centerZ = focusRef.current.z;
    const nextX = centerX - Math.sin(angleRef.current) * Math.cos(pitchRef.current) * distance;
    const nextY = centerY + Math.sin(pitchRef.current) * distance;
    const nextZ = centerZ - Math.cos(angleRef.current) * Math.cos(pitchRef.current) * distance;
    const alpha = 1 - Math.exp(-10 * delta);

    camera.position.set(
      lerp(camera.position.x, nextX, alpha),
      lerp(camera.position.y, nextY, alpha),
      lerp(camera.position.z, nextZ, alpha),
    );
    camera.lookAt(centerX, centerY, centerZ);
  });

  return null;
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}

function targetVector(position: Vec3): THREE.Vector3 {
  return reusableTargetVector.set(position.x, position.y, position.z);
}
