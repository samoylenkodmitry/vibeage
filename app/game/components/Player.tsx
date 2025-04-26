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
  const socket = useGameStore(state => state.socket);

  // --- Remote Player Interpolation ---
  const previousPositionRef = useRef(new Vector3());
  const targetPositionRef = useRef(new Vector3());
  const previousRotationRef = useRef(0);
  const targetRotationRef = useRef(0);
  const lastPositionUpdateTimeRef = useRef(0);
  const interpolationAlphaRef = useRef(0);
  
  // --- Controlled Player Reconciliation ---
  const pendingCorrectionRef = useRef(false);
  const serverCorrectionPositionRef = useRef(new Vector3());
  const correctionStartTimeRef = useRef(0);
  const correctionDurationRef = useRef(300); // ms
  
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
  const playerSpeed = 20;
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
      
      // Store the target position globally
      useGameStore.getState().setTargetWorldPos(newTarget);
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

      // Click-to-move with kinematic position updates
      if (targetPosition && isGrounded) {
        const dir = new Vector3()
          .subVectors(targetPosition, currentPosition)
          .setY(0);

        const dist = dir.length();
        if (dist > TARGET_REACHED_THRESHOLD) {
            dir.normalize().multiplyScalar(playerSpeed * delta);
            // Prevent overshoot
            const step = dist < dir.length() ? dist : dir.length();
            playerRef.current.setNextKinematicTranslation({
                x: currentPosition.x + dir.x * step,
                y: GROUND_POSITION_Y,
                z: currentPosition.z + dir.z * step,
            });
            
            // Update rotation to face direction of movement
            const targetRotation = Math.atan2(dir.x, dir.z);
            playerRef.current.setNextKinematicRotation({
              x: 0,
              y: Math.sin(targetRotation / 2),
              z: 0,
              w: Math.cos(targetRotation / 2)
            });
        } else {
            playerRef.current.setNextKinematicTranslation({
                x: targetPosition.x,
                y: GROUND_POSITION_Y,
                z: targetPosition.z,
            });
            setTargetPosition(null);
            useGameStore.getState().setTargetWorldPos(null);
        }
      }

      // Apply jump velocity if needed
      if (moveDirection.current.jump && isGrounded && !hasJumped) {
        playerRef.current.setLinvel({ x: 0, y: jumpForce, z: 0 });
        moveDirection.current.jump = false;
      }

      // Throttle position updates to server
      // Now handled by gameStore throttling
      const now = Date.now();
      if (!lastUpdateTimeTs.current || now - lastUpdateTimeTs.current >= 50) {
        // Normalize position values to avoid floating point precision issues
        const position = playerRef.current.translation();
        const normalizedPosition = {
          x: parseFloat(position.x.toFixed(2)),
          y: parseFloat(position.y.toFixed(2)),
          z: parseFloat(position.z.toFixed(2))
        };
        
        // Send normalized position to server - throttling handled in gameStore
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
      // Remote player smooth interpolation
      const now = performance.now();
      const timeSinceUpdate = now - lastPositionUpdateTimeRef.current;
      
      // Smoothly interpolate between previous and target position
      // The interpolation speed varies based on update frequency
      const interpolationDuration = 100; // ms - adjust for smoothness
      interpolationAlphaRef.current = Math.min(timeSinceUpdate / interpolationDuration, 1);
      
      // Calculate interpolated position
      const interpolatedPosition = new Vector3().lerpVectors(
        previousPositionRef.current,
        targetPositionRef.current,
        interpolationAlphaRef.current
      );
      
      // Calculate interpolated rotation (handle angle wrapping)
      let angleDiff = targetRotationRef.current - previousRotationRef.current;
      // Ensure we rotate the shortest way around
      if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      
      const interpolatedRotation = previousRotationRef.current + angleDiff * interpolationAlphaRef.current;
      
      // Apply interpolated position and rotation
      playerRef.current.setTranslation(interpolatedPosition, true);
      playerRef.current.setRotation({
        x: 0,
        y: Math.sin(interpolatedRotation / 2),
        z: 0,
        w: Math.cos(interpolatedRotation / 2)
      }, true);
    }
    
    // Handle server-side correction for controlled player
    if (isControlledPlayer && pendingCorrectionRef.current) {
      const now = performance.now();
      const correctionProgress = Math.min(
        (now - correctionStartTimeRef.current) / correctionDurationRef.current, 
        1
      );
      
      if (correctionProgress < 1) {
        // Get current position
        const currentPos = playerRef.current.translation();
        // Create a vector from current position to server position
        const correctionVector = new Vector3().subVectors(
          serverCorrectionPositionRef.current,
          new Vector3(currentPos.x, currentPos.y, currentPos.z)
        );
        // Apply a fraction of the correction each frame
        correctionVector.multiplyScalar(delta * 10); // Adjust speed factor as needed
        
        // Apply partial correction
        const newPos = new Vector3(
          currentPos.x + correctionVector.x,
          currentPos.y + correctionVector.y,
          currentPos.z + correctionVector.z
        );
        playerRef.current.setTranslation(newPos);
      } else {
        // Correction completed
        pendingCorrectionRef.current = false;
      }
    }
  });

  // --- Effect to handle server position updates for interpolation ---
  useEffect(() => {
    if (!playerState) return;
    
    // Handle remote player interpolation
    if (!isControlledPlayer) {
      const now = performance.now();
      // If this is the first update or there's a big time gap, just snap to the new position
      if (lastPositionUpdateTimeRef.current === 0 || now - lastPositionUpdateTimeRef.current > 1000) {
        previousPositionRef.current.set(
          playerState.position.x,
          playerState.position.y,
          playerState.position.z
        );
        targetPositionRef.current.set(
          playerState.position.x,
          playerState.position.y,
          playerState.position.z
        );
        previousRotationRef.current = playerState.rotation.y;
        targetRotationRef.current = playerState.rotation.y;
      } else {
        // Otherwise, set previous to current target, and update target
        previousPositionRef.current.copy(targetPositionRef.current);
        targetPositionRef.current.set(
          playerState.position.x,
          playerState.position.y,
          playerState.position.z
        );
        previousRotationRef.current = targetRotationRef.current;
        targetRotationRef.current = playerState.rotation.y;
        interpolationAlphaRef.current = 0; // Reset interpolation progress
      }
      lastPositionUpdateTimeRef.current = now;
    }
  }, [playerState, isControlledPlayer]);

  // --- Effect to handle server corrections for controlled player ---
  useEffect(() => {
    if (!isControlledPlayer || !socket) return;

    const handlePlayerUpdated = (data: { id: string; position?: { x: number; y: number; z: number }; rotation: { y: number } }) => {
      if (data.id !== playerId) return;
      if (!data.position) {
        console.warn(`Player update received without position data:`, data);
        return;
      }
      // Server is correcting our position
      const currentPosition = playerRef.current?.translation();
      if (!currentPosition) return;
      
      const serverPosition = new Vector3(data.position.x, data.position.y, data.position.z);
      const distance = new Vector3(
        serverPosition.x - currentPosition.x,
        serverPosition.y - currentPosition.y,
        serverPosition.z - currentPosition.z
      ).length();
      
      // Only apply correction if the difference is significant
      if (distance > 0.5) {
        console.log(`Server correction: ${distance.toFixed(2)} units`);
        pendingCorrectionRef.current = true;
        serverCorrectionPositionRef.current.copy(serverPosition);
        correctionStartTimeRef.current = performance.now();
      }
    };

    socket.on('playerUpdated', handlePlayerUpdated);
    
    return () => {
      socket.off('playerUpdated', handlePlayerUpdated);
    };
  }, [isControlledPlayer, playerId, socket]);

  // --- Effect to handle skill effect visualization ---
  useEffect(() => {
    if (!socket) return;

    const handleSkillEffect = (data: { skillId: string, sourceId: string, targetId: string }) => {
      // Debug skill effect origin
      if (data.sourceId === playerId && isControlledPlayer) {
        const currentPosition = playerRef.current?.translation();
        if (currentPosition) {
          console.log('Skill origin check:', {
            skill: data.skillId,
            playerPosition: {
              x: currentPosition.x.toFixed(2),
              y: currentPosition.y.toFixed(2),
              z: currentPosition.z.toFixed(2)
            },
            serverPosition: {
              x: playerState?.position.x.toFixed(2),
              y: playerState?.position.y.toFixed(2),
              z: playerState?.position.z.toFixed(2)
            },
            positionDiff: new Vector3(
              currentPosition.x - (playerState?.position.x || 0),
              currentPosition.y - (playerState?.position.y || 0),
              currentPosition.z - (playerState?.position.z || 0)
            ).length().toFixed(2)
          });
        }
      }
    };

    socket.on('skillEffect', handleSkillEffect);
    
    return () => {
      socket.off('skillEffect', handleSkillEffect);
    };
  }, [socket, playerId, isControlledPlayer, playerState]);

  // --- Listen for player position requests from skill effects ---
  useEffect(() => {
    if (!isControlledPlayer || !playerRef.current) return;

    const handleRequestPosition = (e: CustomEvent) => {
      const { effectId, callback } = e.detail;
      if (playerRef.current) {
        const currentPosition = playerRef.current.translation();
        // Provide the accurate client-side position for skill effects
        callback({
          x: currentPosition.x,
          y: currentPosition.y,
          z: currentPosition.z
        });
      }
    };

    window.addEventListener('requestPlayerPosition', handleRequestPosition as EventListener);
    
    return () => {
      window.removeEventListener('requestPlayerPosition', handleRequestPosition as EventListener);
    };
  }, [isControlledPlayer]);

  // Log player state on mount
  useEffect(() => {
    console.log(`PlayerCharacter mounting: id=${playerId}, isControlled=${isControlledPlayer}`, {
      position: playerState?.position,
      playerStateExists: !!playerState,
      allPlayers: Object.keys(useGameStore.getState().players)
    });

    return () => {
      console.log(`PlayerCharacter unmounting: id=${playerId}, isControlled=${isControlledPlayer}`);
    };
  }, [playerId, isControlledPlayer, playerState]);

  // Render the player model
  if (!playerState) return null; // Don't render if state doesn't exist yet

  console.log(`Rendering 3D player object: id=${playerId}, controlled=${isControlledPlayer}`, {
    position: {
      x: playerState.position.x.toFixed(2),
      y: playerState.position.y.toFixed(2),
      z: playerState.position.z.toFixed(2)
    },
    physicsType: isControlledPlayer ? "kinematicPosition" : "kinematicPosition",
    renderTimestamp: new Date().toISOString()
  });

  return (
    <RigidBody
      ref={playerRef}
      position={[playerState.position.x, playerState.position.y, playerState.position.z]} // Initial position from store
      enabledRotations={[false, true, false]} // Allow Y rotation for facing direction
      colliders={false}
      mass={isControlledPlayer ? 10 : 1}
      type={isControlledPlayer ? "kinematicPosition" : "kinematicPosition"}
      lockRotations={!isControlledPlayer} // Lock rotation for non-controlled players if needed
      linearDamping={isControlledPlayer ? 0.5 : 0}
      angularDamping={isControlledPlayer ? 0.95 : 0}
      friction={isControlledPlayer ? 0.2 : 0}
      restitution={0.0}
      gravityScale={isControlledPlayer ? 2 : 0} // Disable gravity for remote players
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
    </RigidBody>
  );
}

// Main Players Component (Renders all players)
export default function Players() {
  // Use stable selector functions from the store
  const playerIds = useGameStore(selectPlayerIds);
  const myPlayerId = useGameStore(selectMyPlayerId);
  
  // Debug logging for player store state
  useEffect(() => {
    // Log current state of players in store
    const allPlayers = useGameStore.getState().players;
    console.log('DEBUG - Player store state:', {
      playerIds,
      myPlayerId,
      allPlayerCount: Object.keys(allPlayers).length,
      timestamp: new Date().toISOString(),
      duplicatePlayerCheck: Object.values(allPlayers).filter(p => p.id === myPlayerId).length > 1 ? 'DUPLICATE DETECTED' : 'No duplicates',
      allPlayerIds: Object.values(allPlayers).map(p => p.id),
      allSocketIds: Object.values(allPlayers).map(p => p.socketId),
    });
  }, [playerIds, myPlayerId]);

  // Check for duplicate playerIds to prevent rendering the same player twice
  const uniquePlayerIds = [...new Set(playerIds)];
  
  // Direct and aggressive approach to ensure we render exactly one instance of each player
  const filteredPlayerIds = React.useMemo(() => {
    const allPlayers = useGameStore.getState().players;
    const seenPlayers = new Set<string>();
    const result: string[] = [];
    
    // First, ensure our player is included if it exists
    if (myPlayerId && allPlayers[myPlayerId]) {
      result.push(myPlayerId);
      seenPlayers.add(myPlayerId);
      console.log('Added controlled player to render list:', myPlayerId);
    }
    
    // Then add other unique players (but never add duplicates of our player)
    Object.values(allPlayers).forEach(player => {
      // Skip our own player (already added) and any players we've already seen
      if (player.id !== myPlayerId && !seenPlayers.has(player.id)) {
        result.push(player.id);
        seenPlayers.add(player.id);
      }
    });
    
    console.log('Final filtered player IDs for rendering:', {
      myPlayerId,
      filteredCount: result.length,
      filteredIds: result
    });
    
    return result;
  }, [uniquePlayerIds, myPlayerId]);

  // Memoize player creation
  const playerComponents = React.useMemo(() => 
    filteredPlayerIds.map(id => (
      <PlayerCharacter 
        key={id}
        playerId={id}
        isControlledPlayer={id === myPlayerId}
      />
    ))
  , [filteredPlayerIds, myPlayerId]); // Only recreate when IDs or controlled player changes

  // Render just the players, no target marker (moved to the TargetRing component)
  return <>{playerComponents}</>;
}