import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { WORLD_SETTINGS } from '../../../packages/content/world';
import { type VecXZ } from '../../../packages/protocol/messages';
import type {
  EnemyEntity,
  GameClientState,
  PlayerEntity,
  Vec3,
  VisibleCast,
} from './gameTypes';
import {
  CastVfx,
  EnemyHealthBar,
  EnemyHitFlash,
  LootMarker,
  SelectedEnemyRing,
  TargetDestinationMarker,
  WorldEventVfx,
} from './SceneVfx';
import { ZoneLandmarks } from './ZoneLandmarks';
import {
  applyCameraDragDelta,
  CAMERA_FOCUS_RESPONSE,
  CAMERA_POSITION_RESPONSE,
  getCameraOrbitPosition,
  hasMeaningfulCameraFocusDelta,
  smoothingAlpha,
} from './cameraRig';
import { getEnemyVisual } from './worldVisuals';

const GROUND_Y = 0;
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
const pointerWorldPoint = new THREE.Vector3();

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
      camera={{ position: [0, 18, 22], fov: 55, near: 0.1, far: WORLD_SETTINGS.cameraFar }}
      onCreated={({ gl }) => {
        gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      }}
    >
      <color attach="background" args={['#071015']} />
      <fog attach="fog" args={['#071015', WORLD_SETTINGS.fogNear, WORLD_SETTINGS.fogFar]} />
      <ambientLight intensity={0.62} />
      <directionalLight position={[24, 32, 18]} intensity={1.4} castShadow />
      <WorldGround onMove={onMove} />
      <ZoneLandmarks />
      <TargetDestinationMarker target={state.targetWorldPos} />
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
      {Object.values(state.visualEvents).map((event) => (
        <WorldEventVfx key={event.id} event={event} />
      ))}
      <CameraRig focus={focus} presentationFocusRef={cameraAnchorRef} />
    </Canvas>
  );
}

function WorldGround({
  onMove,
}: {
  onMove: (target: VecXZ) => void;
}) {
  const grid = useMemo(
    () => new THREE.GridHelper(WORLD_SETTINGS.groundSize, WORLD_SETTINGS.gridDivisions, '#6ee7d8', '#253f47'),
    [],
  );

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    const point = event.ray.intersectPlane(groundPlane, pointerWorldPoint);
    if (!point) {
      return;
    }

    onMove({ x: point.x, z: point.z });
  }

  return (
    <group>
      <primitive object={grid} position={[0, GROUND_Y + 0.01, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerDown={handlePointerDown}>
        <planeGeometry args={[WORLD_SETTINGS.groundSize, WORLD_SETTINGS.groundSize]} />
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
  const visual = getEnemyVisual(enemy.type);
  const color = enemy.isAlive ? visual.color : '#4b5563';
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
      {isSelected && <SelectedEnemyRing />}
      <mesh castShadow onPointerDown={handlePointerDown}>
        {visual.shape === 'sphere' ? (
          <sphereGeometry args={[0.58, 18, 14]} />
        ) : (
          <boxGeometry args={[1.05, enemy.isAlive ? visual.height : 0.25, 1.05]} />
        )}
        <meshStandardMaterial color={color} roughness={0.82} />
      </mesh>
      {enemy.isAlive && visual.glow && (
        <pointLight color={visual.color} intensity={0.9} distance={4} />
      )}
      {enemy.isAlive && <EnemyHitFlash health={enemy.health} />}
      <EnemyHealthBar enemy={enemy} visible={isSelected || enemy.health < enemy.maxHealth} />
    </SmoothedEntityGroup>
  );
}

function CastMarker({ cast }: { cast: VisibleCast }) {
  const snapshot = cast.snapshot;

  return (
    <SmoothedEntityGroup position={{ x: snapshot.pos.x, y: GROUND_Y + 1, z: snapshot.pos.z }} response={18}>
      <CastVfx snapshot={snapshot} />
    </SmoothedEntityGroup>
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
  const targetRef = useRef(new THREE.Vector3());

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

    const alpha = smoothingAlpha(response, delta);
    group.position.lerp(targetRef.current.set(position.x, position.y, position.z), alpha);
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
  const focusTargetRef = useRef(new THREE.Vector3(focus.x, GROUND_Y + 1.4, focus.z));
  const cameraTargetRef = useRef(new THREE.Vector3());
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

      const orbit = applyCameraDragDelta(
        { angle: angleRef.current, pitch: pitchRef.current },
        {
          x: event.clientX - lastPointerRef.current.x,
          y: event.clientY - lastPointerRef.current.y,
        },
      );
      angleRef.current = orbit.angle;
      pitchRef.current = orbit.pitch;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      event.preventDefault();
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
    const presentationFocus = presentationFocusRef.current;
    focusTargetRef.current.set(
      presentationFocus?.x ?? focus.x,
      GROUND_Y + 1.4,
      presentationFocus?.z ?? focus.z,
    );
    if (hasMeaningfulCameraFocusDelta(focusRef.current, focusTargetRef.current)) {
      focusRef.current.lerp(focusTargetRef.current, smoothingAlpha(CAMERA_FOCUS_RESPONSE, delta));
    }

    const targetPosition = getCameraOrbitPosition(focusRef.current, {
      angle: angleRef.current,
      pitch: pitchRef.current,
    });
    const alpha = smoothingAlpha(CAMERA_POSITION_RESPONSE, delta);
    camera.position.lerp(
      cameraTargetRef.current.set(targetPosition.x, targetPosition.y, targetPosition.z),
      alpha,
    );
    camera.lookAt(focusRef.current);
  });

  return null;
}

function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}
