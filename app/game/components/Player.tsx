import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import { Vector3, Euler, Raycaster, Plane, Mesh, Vector2 } from 'three';
import { useGameStore, selectPlayerIds, selectMyPlayerId, selectPlayer, selectSendPlayerMove } from '../systems/gameStore';

// Define GROUND_POSITION_Y constant
const GROUND_POSITION_Y = 0.5;

// Individual Player Component
function PlayerCharacter({ playerId, isControlledPlayer }: { playerId: string, isControlledPlayer: boolean }) {
  const playerRef = useRef<any>(null);
  const playerState = useGameStore(selectPlayer(playerId));
  const sendPlayerMove = useGameStore(selectSendPlayerMove);
  const lastUpdateTimeTs = useRef<number | null>(null);

  // --- Hooks and State specific to the controlled player ---
  const { camera, gl, raycaster } = useThree();
  const { rapier, world } = useRapier();
  const [isGrounded, setIsGrounded] = useState(false);
  const [hasJumped, setHasJumped] = useState(false);
  const [targetPosition, setTargetPosition] = useState<Vector3 | null>(null);
  const movementStartTimeTs = useRef<number | null>(null);
  const lastDistanceToTarget = useRef<number>(Infinity);
  const stuckCounter = useRef(0);
  const [isRotating, setIsRotating] = useState(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const cameraAngleRef = useRef(Math.PI);
  const cameraInitialized = useRef(false);
  const groundPlane = new Plane(new Vector3(0, 1, 0), -GROUND_POSITION_Y);
  const moveDirection = useRef({ forward: 0, right: 0, jump: false });

  // --- Constants ---
  const playerSpeed = 10;
  const jumpForce = 8;
  const MOVEMENT_PRECISION = 0.1;
  const TARGET_REACHED_THRESHOLD = 0.3;

  // --- Callbacks for Controlled Player Input ---
  const handleMouseClick = useCallback((e: MouseEvent) => {
    if (!isControlledPlayer || e.button !== 0 || isRotating) return;
    if ((e.target as HTMLElement).closest('.pointer-events-auto')) return;

    // Make sure we're using the correct canvas dimensions for accurate clicking
    const canvasRect = gl.domElement.getBoundingClientRect();
    
    // Calculate normalized device coordinates (-1 to +1) using the canvas's actual position
    const mouse = new Vector2(
      ((e.clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
      -((e.clientY - canvasRect.top) / canvasRect.height) * 2 + 1
    );

    // Update the ray with the camera and mouse position
    raycaster.setFromCamera(mouse, camera);

    // Find where ray intersects the ground plane
    const intersectPoint = new Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, intersectPoint)) {
      // For debugging, log the click position
      console.log('Click position:', intersectPoint);
      
      movementStartTimeTs.current = Date.now();
      lastDistanceToTarget.current = Infinity;
      stuckCounter.current = 0;
      
      // Create target position, ensuring Y is at ground level
      const newTarget = new Vector3(intersectPoint.x, GROUND_POSITION_Y, intersectPoint.z);
      
      // Set the target position in the component state
      setTargetPosition(newTarget);
      
      // Dispatch an event so the main Players component can render the target marker
      window.dispatchEvent(new CustomEvent('targetPositionUpdate', {
        detail: { targetPosition: newTarget }
      }));
    }
  }, [isControlledPlayer, isRotating, camera, raycaster, groundPlane, gl]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!isControlledPlayer || e.button !== 2) return;
    setIsRotating(true);
    previousMousePosition.current = { x: e.clientX, y: e.clientY };
    document.body.style.cursor = 'grabbing';
    e.preventDefault(); e.stopPropagation();
  }, [isControlledPlayer]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isControlledPlayer || e.button !== 2) return;
    setIsRotating(false);
    document.body.style.cursor = 'default';
    e.preventDefault(); e.stopPropagation();
  }, [isControlledPlayer]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isControlledPlayer || !isRotating) return;
    const deltaX = e.clientX - previousMousePosition.current.x;
    cameraAngleRef.current -= deltaX * 0.02;
    previousMousePosition.current = { x: e.clientX, y: e.clientY };
    e.preventDefault(); e.stopPropagation();
  }, [isControlledPlayer, isRotating]);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    if (!isControlledPlayer) return;
    e.preventDefault(); e.stopPropagation();
  }, [isControlledPlayer]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isControlledPlayer || e.code !== 'Space' || !isGrounded || hasJumped) return;
    moveDirection.current.jump = true;
    setHasJumped(true);
  }, [isControlledPlayer, isGrounded, hasJumped]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (!isControlledPlayer || e.code !== 'Space') return;
    moveDirection.current.jump = false;
  }, [isControlledPlayer]);

  // --- Input Listener Effect (only for controlled player) ---
  useEffect(() => {
    if (!isControlledPlayer) return;

    if (!cameraInitialized.current) {
      cameraAngleRef.current = Math.PI;
      cameraInitialized.current = true;
    }

    window.addEventListener('click', handleMouseClick);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    document.body.style.cursor = 'default';

    return () => {
      window.removeEventListener('click', handleMouseClick);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isControlledPlayer, handleMouseClick, handleMouseDown, handleMouseUp, handleMouseMove, handleContextMenu, handleKeyDown, handleKeyUp]);

  // --- Frame Update Logic ---
  useFrame((state, delta) => {
    if (!playerRef.current || !playerState) return;

    const currentPosition = playerRef.current.translation();
    const currentVelocity = playerRef.current.linvel();

    // --- Controlled Player Logic ---
    if (isControlledPlayer) {
      // Ground Check
      const origin = { x: currentPosition.x, y: currentPosition.y + 0.1, z: currentPosition.z };
      const ray = new rapier.Ray(origin, { x: 0, y: -1, z: 0 });
      const hit = world.castRay(ray, 0.8, true);
      const isNearGround = Math.abs(currentPosition.y - GROUND_POSITION_Y) < 0.2;
      const isNotRising = currentVelocity.y <= 0.01;
      const nowGrounded = (hit !== null || isNearGround) && isNotRising;

      // Only update grounded state if it actually changed
      if (nowGrounded !== isGrounded) {
        setIsGrounded(nowGrounded);
        if (nowGrounded && hasJumped) {
          setHasJumped(false);
        }
      }

      // Only apply these physics updates if the state is actually grounded
      if (isGrounded) {
        // Batch physics updates to minimize state changes
        const physicsUpdates = {
          velocity: { x: currentVelocity.x, y: 0, z: currentVelocity.z },
          position: currentPosition
        };

        if (Math.abs(currentPosition.y - GROUND_POSITION_Y) > 0.01) {
          physicsUpdates.position = { ...currentPosition, y: GROUND_POSITION_Y };
          playerRef.current.setTranslation(physicsUpdates.position);
        }
        
        playerRef.current.setLinvel(physicsUpdates.velocity);
      }

      // Click-to-move with optimized updates
      let calculatedVelocity = { x: 0, y: currentVelocity.y, z: 0 };
      if (targetPosition && isGrounded) {
        const direction = new Vector3().subVectors(targetPosition, currentPosition);
        direction.y = 0;
        const distanceToTarget = direction.length();

        if (distanceToTarget > MOVEMENT_PRECISION && stuckCounter.current < 60) {
          direction.normalize();
          const speedMultiplier = Math.min(distanceToTarget, 1.5);
          calculatedVelocity.x = direction.x * playerSpeed * speedMultiplier;
          calculatedVelocity.z = direction.z * playerSpeed * speedMultiplier;

          // Batch rotation updates
          playerRef.current.setRotation({ w: 1.0, x: 0.0, y: 0.0, z: 0.0 });
          playerRef.current.applyImpulse({ x: 0, y: 0, z: 0 }, true);
          playerRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);

          const targetRotation = Math.atan2(direction.x, direction.z);
          playerRef.current.setNextKinematicRotation({
            x: 0,
            y: Math.sin(targetRotation / 2),
            z: 0,
            w: Math.cos(targetRotation / 2)
          });

          lastDistanceToTarget.current = distanceToTarget;
        } else {
          // Optimize stopping logic
          const currentSpeed = new Vector3(currentVelocity.x, 0, currentVelocity.z).length();
          if (currentSpeed > 0.1) {
            calculatedVelocity.x = currentVelocity.x * 0.8;
            calculatedVelocity.z = currentVelocity.z * 0.8;
          } else {
            calculatedVelocity.x = 0;
            calculatedVelocity.z = 0;
          }

          if (distanceToTarget <= TARGET_REACHED_THRESHOLD) {
            playerRef.current.setTranslation({ 
              x: targetPosition.x,
              y: GROUND_POSITION_Y,
              z: targetPosition.z
            });
            setTargetPosition(null);
            calculatedVelocity = { x: 0, y: currentVelocity.y, z: 0 };
          }
        }
      } else if (isGrounded) {
        calculatedVelocity = { x: 0, y: currentVelocity.y, z: 0 };
      }

      // Apply jump velocity if needed
      if (moveDirection.current.jump && isGrounded && !hasJumped) {
        calculatedVelocity.y = jumpForce;
        moveDirection.current.jump = false;
      }

      // Batch physics updates
      playerRef.current.setLinvel(calculatedVelocity);

      // Throttle position updates to server
      const now = Date.now();
      if (!lastUpdateTimeTs.current || now - lastUpdateTimeTs.current >= 50) { // 20 updates per second
        // Normalize position values to avoid floating point precision issues
        const position = playerRef.current.translation();
        const normalizedPosition = {
          x: parseFloat(position.x.toFixed(2)),
          y: parseFloat(position.y.toFixed(2)),
          z: parseFloat(position.z.toFixed(2))
        };
        
        // Send normalized position to server
        sendPlayerMove(normalizedPosition, cameraAngleRef.current);
        lastUpdateTimeTs.current = now;
      }

      // Update camera position
      const distance = 15;
      const height = 10;
      const angle = cameraAngleRef.current;
      camera.position.set(
        currentPosition.x - Math.sin(angle) * distance,
        currentPosition.y + height,
        currentPosition.z - Math.cos(angle) * distance
      );
      camera.lookAt(currentPosition.x, currentPosition.y + 1.0, currentPosition.z);
    } else {
      // Optimize non-controlled player updates
      const serverPos = playerState.position;
      const serverRotY = playerState.rotation.y;

      // Only update if position has changed significantly
      const currentPos = playerRef.current.translation();
      const positionDiff = new Vector3(
        serverPos.x - currentPos.x,
        serverPos.y - currentPos.y,
        serverPos.z - currentPos.z
      ).length();

      if (positionDiff > 0.01) {
        playerRef.current.setTranslation(serverPos, true);
        playerRef.current.setRotation({
          x: 0,
          y: Math.sin(serverRotY / 2),
          z: 0,
          w: Math.cos(serverRotY / 2)
        }, true);
      }
    }
  });

  // Render the player model
  if (!playerState) return null; // Don't render if state doesn't exist yet

  return (
    <RigidBody
      ref={playerRef}
      position={[playerState.position.x, playerState.position.y, playerState.position.z]} // Initial position from store
      enabledRotations={[false, true, false]} // Allow Y rotation for facing direction
      colliders={false}
      mass={10}
      type="dynamic"
      lockRotations={!isControlledPlayer} // Lock rotation for non-controlled players if needed
      linearDamping={0.5}
      angularDamping={0.95}
      friction={0.2}
      restitution={0.0}
      gravityScale={isControlledPlayer ? 2 : 0} // Disable gravity for remote players if server handles position
      ccd={true}
      key={playerId} // Important for React to identify elements correctly
      userData={{ type: 'player', id: playerId }} // Add userData for identification
    >
      <CapsuleCollider args={[0.5, 0.6]} />
      {/* Single unified player model */}
      <group>
        {/* Body */}
        <mesh castShadow position={[0, 0.5, 0]}>
          <capsuleGeometry args={[0.5, 1.2, 8, 16]} />
          <meshStandardMaterial color={isControlledPlayer ? "#3870c4" : "#5a8cd9"} />
        </mesh>
        {/* Head */}
        <mesh castShadow position={[0, 1.6, 0]}>
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshStandardMaterial color="#f5deb3" />
        </mesh>
      </group>
      {/* Target marker only for controlled player */}
      {isControlledPlayer && targetPosition && (
        <mesh position={targetPosition} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.5, 16]} />
          <meshBasicMaterial color="#ffff00" transparent opacity={0.6} />
        </mesh>
      )}
    </RigidBody>
  );
}

// Main Players Component (Renders all players)
export default function Players() {
  // Use stable selector functions from the store
  const playerIds = useGameStore(selectPlayerIds);
  const myPlayerId = useGameStore(selectMyPlayerId);
  
  // Get target position for the controlled player
  const controlledPlayer = useGameStore(state => 
    state.myPlayerId ? state.players[state.myPlayerId] : null
  );
  const [targetPosition, setTargetPosition] = useState<Vector3 | null>(null);

  // Subscribe to the targetPosition from the controlled player character
  useEffect(() => {
    if (!controlledPlayer) return;
    
    // Create a custom event to listen for target position updates
    const handleTargetPositionUpdate = (e: CustomEvent) => {
      setTargetPosition(e.detail.targetPosition);
    };
    
    // Add event listener
    window.addEventListener('targetPositionUpdate', handleTargetPositionUpdate as EventListener);
    
    // Clean up
    return () => {
      window.removeEventListener('targetPositionUpdate', handleTargetPositionUpdate as EventListener);
    };
  }, [controlledPlayer]);

  // Check for duplicate playerIds to prevent rendering the same player twice
  const uniquePlayerIds = [...new Set(playerIds)];

  // Memoize player creation
  const playerComponents = React.useMemo(() => 
    uniquePlayerIds.map(id => (
      <PlayerCharacter 
        key={id}
        playerId={id}
        isControlledPlayer={id === myPlayerId}
      />
    ))
  , [uniquePlayerIds, myPlayerId]); // Only recreate when IDs or controlled player changes

  return (
    <>
      {playerComponents}
      
      {/* Render target marker in world space, not relative to player */}
      {targetPosition && (
        <mesh position={targetPosition} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.5, 16]} />
          <meshBasicMaterial color="#ffff00" transparent opacity={0.6} />
        </mesh>
      )}
    </>
  );
}