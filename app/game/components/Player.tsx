import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import { Vector3, Euler, Raycaster, Plane, Mesh, Vector2 } from 'three';
import { useGameStore, selectPlayerIds, selectMyPlayerId, selectPlayer } from '../systems/gameStore';
import { simulateMovement, GROUND_Y } from '../systems/moveSimulation';
import { VecXZ } from '../../../shared/messages';
import { SnapBuffer } from '../systems/interpolation';

// Movement constants
const BASE_SPEED = 20;
const SPRINT_MUL = 1.5;

// Individual Player Component
function PlayerCharacter({ playerId, isControlledPlayer }: { playerId: string, isControlledPlayer: boolean }) {
  const playerRef = useRef<any>(null);
  const playerState = useGameStore(selectPlayer(playerId));
  const lastUpdateTimeTs = useRef<number | null>(null);
  const socket = useGameStore(state => state.socket);

  // --- Remote Player Interpolation ---
  const previousPositionRef = useRef(new Vector3());
  const targetPositionRef = useRef(new Vector3());
  const previousRotationRef = useRef(0);
  const targetRotationRef = useRef(0);
  const lastPositionUpdateTimeRef = useRef(0);
  const interpolationAlphaRef = useRef(0);
  
  // --- Snapshot interpolation with SnapBuffer ---
  const snapBufferRef = useRef<SnapBuffer | null>(null);
  
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
  const groundPlane = new Plane(new Vector3(0, 1, 0), -GROUND_Y);
  const moveDirection = useRef({ forward: 0, right: 0, jump: false });
  
  // Keyboard state for determining if shift is pressed (sprinting)
  const [keys, setKeys] = useState({ shift: false });

  // --- Constants ---
  const jumpForce = 8;
  const MOVEMENT_PRECISION = 0.1;
  const TARGET_REACHED_THRESHOLD = 0.05; // Smaller threshold for more precise stopping

  // --- Callbacks for Controlled Player Input ---
  const handleMouseClick = useCallback((e: MouseEvent) => {
    if (!isControlledPlayer || e.button !== 0 || isRotating) return;
    if ((e.target as HTMLElement).closest('.pointer-events-auto')) return;
    if (!socket || !playerState) return;

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
      const newTarget = new Vector3(intersectPoint.x, GROUND_Y, intersectPoint.z);
      
      // Get current position
      const currentPos = playerRef.current.translation();
      
      // Call the store's function to send the move start message with new protocol
      const path = [{ x: newTarget.x, z: newTarget.z }];
      const speed = BASE_SPEED * (keys.shift ? SPRINT_MUL : 1);
      useGameStore.getState().sendMoveStart(path, speed);
      
      // Set the target position in the component state (for local simulation)
      setTargetPosition(newTarget);
      
      // Store the target position globally
      useGameStore.getState().setTargetWorldPos(newTarget);
    }
  }, [isControlledPlayer, isRotating, camera, raycaster, groundPlane, gl, socket, playerState, playerId, keys]);

  const emitMoveStop = useCallback((position: any) => {
    if (!socket || !playerState) return;
    
    // Using the renamed function for immediate move sync
    useGameStore.getState().sendMoveSyncImmediate({ x: position.x, z: position.z });
    
    // Clear local target
    setTargetPosition(null);
    useGameStore.getState().setTargetWorldPos(null);
  }, [socket, playerState]);

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
    if (!isControlledPlayer) return;
    
    // Handle space for jumping
    if (e.code === 'Space' && !hasJumped && isGrounded) {
      moveDirection.current.jump = true;
      setHasJumped(true);
    }
    
    // Handle shift for sprint
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      setKeys(prev => ({ ...prev, shift: true }));
    }
    
    // Handle S key for force stop
    if (e.code === 'KeyS' && playerState?.movement?.dest) {
      if (playerRef.current) {
        emitMoveStop(playerRef.current.translation());
      }
    }
    
  }, [isControlledPlayer, hasJumped, isGrounded, playerState, emitMoveStop]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (!isControlledPlayer) return;
    
    // Handle shift for sprint
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      setKeys(prev => ({ ...prev, shift: false }));
    }
    
  }, [isControlledPlayer]);

  // --- Register event listeners for controlled player ---
  useEffect(() => {
    if (!isControlledPlayer) return;

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

  // --- Update Player.tsx useFrame handler to handle position snapshots ---
  useFrame((_, delta) => {
    if (!playerRef.current || !playerState) return;

    try {
      const currentPosition = playerRef.current.translation();
      lastUpdateTimeTs.current = Date.now();

      // For controlled player, we do client-side prediction and light reconciliation
      if (isControlledPlayer) {
        // Check if we have a movement active
        if (playerState.movement?.dest && targetPosition) {
          const dest = playerState.movement.dest;
          const speed = playerState.movement.speed;
          
          // Use simulated movement for predictive client updates
          const isMoving = simulateMovement(playerRef.current, dest, speed, delta);
          
          if (!isMoving) {
            // We've arrived at destination - notify server but only once
            if (!targetPosition) return; // Already notified server
            
            // First send MoveSync then clear the movement state
            useGameStore.getState().sendMoveSyncImmediate({ 
              x: currentPosition.x, 
              z: currentPosition.z 
            });
            setTargetPosition(null);
          } else {
            // Update rotation to face direction of movement
            const dir = new Vector3(dest.x - currentPosition.x, 0, dest.z - currentPosition.z).normalize();
            const targetRotation = Math.atan2(dir.x, dir.z);
            playerRef.current.setNextKinematicRotation({
              x: 0,
              y: Math.sin(targetRotation / 2),
              z: 0,
              w: Math.cos(targetRotation / 2)
            });
          }
        }

        // Apply jump velocity if needed
        if (moveDirection.current.jump && isGrounded && !hasJumped) {
          playerRef.current.setLinvel({ x: 0, y: jumpForce, z: 0 });
          moveDirection.current.jump = false;
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
        // Remote player: Use SnapBuffer for interpolation
        if (snapBufferRef.current && !isControlledPlayer && playerState) {
          const INTERP_LAG = 120; // ms
          const renderTs = Date.now() - INTERP_LAG;
          const playerSpeed = playerState.movement?.speed || 25;
          const sample = snapBufferRef.current.sample(renderTs, playerSpeed);
          
          if (sample) {
            // Apply interpolated position
            playerRef.current.setTranslation({
              x: sample.x,
              y: GROUND_Y,
              z: sample.z
            }, true);
            
            // Apply interpolated rotation
            playerRef.current.setRotation({
              x: 0,
              y: Math.sin(sample.rot/2),
              z: 0,
              w: Math.cos(sample.rot/2)
            }, true);
          }
        }
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
    } catch (err) {
      console.error("Error in useFrame handler:", err);
    }
  });

  // --- Effect to handle server position updates for interpolation ---
  useEffect(() => {
    if (!playerState) return;
    
    // Handle remote player interpolation
    if (!isControlledPlayer) {
      const now = performance.now();
      // If movement just stopped, snap interpolation refs to stop position
      if (!playerState.movement?.dest) {
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
        interpolationAlphaRef.current = 0;
      } else if (lastPositionUpdateTimeRef.current === 0 || now - lastPositionUpdateTimeRef.current > 1000) {
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
    if (!socket) return;

    // Handle position updates from server 
    const handlePosSnap = (data: { type: string, snaps: Array<{ id: string, pos: VecXZ, vel: VecXZ, ts: number }> }) => {
      if (data.type !== 'PosSnap') return;
      if (!data.snaps || !Array.isArray(data.snaps)) return;
      
      // Find this player's snap in the snaps array
      const thisPlayerSnap = data.snaps.find(snap => snap && snap.id === playerId);
      if (!thisPlayerSnap || !thisPlayerSnap.pos || !thisPlayerSnap.vel || !thisPlayerSnap.ts) return;
      
      if (isControlledPlayer) {
        // For controlled player: apply correction if needed
        const currentPosition = playerRef.current?.translation();
        if (!currentPosition) return;
        
        const serverPosition = new Vector3(thisPlayerSnap.pos.x, currentPosition.y, thisPlayerSnap.pos.z);
        const distance = new Vector3(
          serverPosition.x - currentPosition.x,
          0, // Ignore Y differences
          serverPosition.z - currentPosition.z
        ).length();
        
        // Only apply correction if the difference is significant
        if (distance > 1.0) {
          console.log(`Server correction: ${distance.toFixed(2)} units`);
          pendingCorrectionRef.current = true;
          serverCorrectionPositionRef.current.copy(serverPosition);
          correctionStartTimeRef.current = performance.now();
        }
      } else {
        // For remote players: use SnapBuffer for interpolation
        if (snapBufferRef.current && playerState) {
          try {
            snapBufferRef.current.push({
              pos: thisPlayerSnap.pos,
              vel: thisPlayerSnap.vel,
              rot: playerState.rotation?.y || 0,
              snapTs: thisPlayerSnap.ts
            });
          } catch (err) {
            console.error('Error pushing to snap buffer:', err);
          }
        }
      }
    };
    
    // Listen for position snapshots
    socket.on('msg', handlePosSnap);
    
    return () => {
      socket.off('msg', handlePosSnap);
    };
  }, [playerId, socket, isControlledPlayer, playerState]);

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

  // Initialize the interpolation buffer on component mount
  useEffect(() => {
    if (!isControlledPlayer) {
      console.log(`Creating SnapBuffer for remote player ${playerId}`);
      snapBufferRef.current = new SnapBuffer();
    }
    
    return () => {
      // Clean up
      if (snapBufferRef.current && !isControlledPlayer) {
        console.log(`Cleaning up SnapBuffer for remote player ${playerId}`);
        snapBufferRef.current = null;
      }
    };
  }, [isControlledPlayer, playerId]);

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