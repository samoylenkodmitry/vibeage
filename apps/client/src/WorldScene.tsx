import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { CastState, type VecXZ } from '../../../packages/protocol/messages';
import type { EnemyEntity, GameClientState, PlayerEntity, Vec3, VisibleCast } from './gameTypes';

const GROUND_Y = 0;

type WorldSceneProps = {
  state: GameClientState;
  onMove: (target: VecXZ) => void;
  onSelectTarget: (targetId: string | null) => void;
};

export function WorldScene({ state, onMove, onSelectTarget }: WorldSceneProps) {
  const myPlayer = state.myPlayerId ? state.players[state.myPlayerId] ?? null : null;
  const focus = myPlayer?.position ?? { x: 0, y: 0.5, z: 0 };

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
        <PlayerMarker key={player.id} player={player} isSelf={player.id === state.myPlayerId} />
      ))}
      {Object.values(state.enemies).map((enemy) => (
        <EnemyMarker
          key={enemy.id}
          enemy={enemy}
          isSelected={enemy.id === state.selectedTargetId}
          onSelect={onSelectTarget}
        />
      ))}
      {Object.values(state.casts).map((cast) => (
        <CastMarker key={cast.snapshot.castId} cast={cast} />
      ))}
      <CameraRig focus={focus} />
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

function PlayerMarker({ player, isSelf }: { player: PlayerEntity; isSelf: boolean }) {
  const color = player.isAlive ? (isSelf ? '#75f5c8' : '#8bb5ff') : '#64748b';
  const height = isSelf ? 1.8 : 1.55;

  return (
    <group position={[player.position.x, GROUND_Y + height / 2, player.position.z]} rotation={[0, player.rotation?.y ?? 0, 0]}>
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
    </group>
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
    <group position={[enemy.position.x, y, enemy.position.z]} rotation={[0, enemy.rotation?.y ?? 0, 0]}>
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
    </group>
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
    <mesh position={[snapshot.pos.x, GROUND_Y + 1, snapshot.pos.z]} scale={scale}>
      <sphereGeometry args={[0.42, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.65} />
    </mesh>
  );
}

function CameraRig({ focus }: { focus: Vec3 }) {
  const { camera, gl } = useThree();
  const angleRef = useRef(Math.PI * 0.82);
  const pitchRef = useRef(0.46);
  const draggingRef = useRef(false);
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

  useFrame(() => {
    const distance = 24;
    const centerX = focus.x;
    const centerY = GROUND_Y + 1.4;
    const centerZ = focus.z;
    const nextX = centerX - Math.sin(angleRef.current) * Math.cos(pitchRef.current) * distance;
    const nextY = centerY + Math.sin(pitchRef.current) * distance;
    const nextZ = centerZ - Math.cos(angleRef.current) * Math.cos(pitchRef.current) * distance;

    camera.position.set(
      lerp(camera.position.x, nextX, 0.18),
      lerp(camera.position.y, nextY, 0.18),
      lerp(camera.position.z, nextZ, 0.18),
    );
    camera.lookAt(centerX, centerY, centerZ);
  });

  return null;
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}
