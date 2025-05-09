import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CapsuleCollider} from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore, selectPlayer, selectMyPlayerId, selectPlayerIds } from '../systems/gameStore';
import { simulateMovement, GROUND_Y } from '../systems/moveSimulation';
import { VecXZ } from '../../../shared/messages';
import { SnapBuffer } from '../systems/interpolation';

// Individual Player Component
function PlayerCharacter({ playerId, isControlledPlayer }: { playerId: string, isControlledPlayer: boolean }) {
  const playerRef = useRef<any>(null);
  const playerState = useGameStore(selectPlayer(playerId));
  const lastUpdateTimeTs = useRef<number | null>(null);
  const socket = useGameStore(state => state.socket);

  // --- Remote Player Interpolation ---
  const previousPositionRef = useRef(new THREE.Vector3());
  const targetPositionRef = useRef(new THREE.Vector3());
  const previousRotationRef = useRef(0);
  const targetRotationRef = useRef(0);
  const lastPositionUpdateTimeRef = useRef(0);
  const interpolationAlphaRef = useRef(0);
  
  // --- Snapshot interpolation with SnapBuffer ---
  const snapBufferRef = useRef<SnapBuffer | null>(null);
  
  // --- Controlled Player Reconciliation ---
  const pendingCorrectionRef = useRef(false);
  const serverCorrectionPositionRef = useRef(new THREE.Vector3());
  const correctionStartTimeRef = useRef(0);
  const correctionDurationRef = useRef(300); // ms
  
  // --- Hooks and State specific to the controlled player ---
  const { camera, gl, raycaster } = useThree();
  const [isGrounded] = useState(false);
  const [hasJumped, setHasJumped] = useState(false);
  const [targetPosition, setTargetPosition] = useState<THREE.Vector3 | null>(null);
  const movementStartTimeTs = useRef<number | null>(null);
  const lastDistanceToTarget = useRef<number>(Infinity);
  const stuckCounter = useRef(0);
  const [isRotating, setIsRotating] = useState(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const cameraAngleRef = useRef(Math.PI);

  // Used for ground plane intersection calculations and movement
  const moveDirection = useRef({ forward: 0, right: 0, jump: false });
  
  // --- Constants ---
  const jumpForce = 8;

  // --- Callbacks for Controlled Player Input ---
  const handleMouseClick = useCallback((e: MouseEvent) => {
    if (!isControlledPlayer || e.button !== 0 || isRotating) return;
    if ((e.target as HTMLElement).closest('.pointer-events-auto')) return;
    if (!socket || !playerState) return;

    console.log('Mouse click event:', e.clientX, e.clientY, 'Player controlled:', isControlledPlayer);

    try {
      // Make sure we're using the correct canvas dimensions for accurate clicking
      const canvasRect = gl.domElement.getBoundingClientRect();
      
      // Calculate normalized device coordinates (-1 to +1) using the canvas's actual position
      const mouseX = ((e.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
      const mouseY = -((e.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
      
      // Create the mouse vector and set it directly
      raycaster.ray.origin.setFromMatrixPosition(camera.matrixWorld);
      raycaster.ray.direction.set(mouseX, mouseY, 0.5).unproject(camera).sub(raycaster.ray.origin).normalize();
      
      console.log('Ray direction:', raycaster.ray.direction);
      
      // Create a y-plane at ground level and check for intersection
      const planeY = GROUND_Y; 
      const rayDir = raycaster.ray.direction.clone();
      const rayOrig = raycaster.ray.origin.clone();
      
      // Calculate distance along ray to y plane
      if (rayDir.y === 0) {
        console.warn('Ray is parallel to ground plane, no intersection');
      } else {
        const t = (planeY - rayOrig.y) / rayDir.y;
        if (t >= 0) {
          // Calculate the intersection point manually to avoid type compatibility issues
          const rayPos = new THREE.Vector3(
            rayOrig.x + rayDir.x * t,
            rayOrig.y + rayDir.y * t,
            rayOrig.z + rayDir.z * t
          );
          console.log('Ray intersects ground at:', rayPos);
          
          // Store movement start time and reset tracking variables
          movementStartTimeTs.current = Date.now();
          lastDistanceToTarget.current = Infinity;
          stuckCounter.current = 0;
          
          // Create target position, ensuring Y is at ground level
          const newTarget = new THREE.Vector3(rayPos.x, GROUND_Y, rayPos.z);
          console.log('Setting movement target:', newTarget);
        
          // Get reference to store to ensure we're using the proper state
          const store = useGameStore.getState();
          
          // First update local state to prevent rendering issues
          setTargetPosition(newTarget);
          store.setTargetWorldPos(newTarget);
          
          // Then send network message with move intent
          store.sendMoveIntent({ 
            x: newTarget.x, 
            z: newTarget.z 
          });
        } else {
          console.warn('Ray did not intersect ground plane');
        }
      }
    } catch (err) {
      console.error('Error in handleMouseClick:', err);
    }
  }, [isControlledPlayer, isRotating, camera, raycaster, gl, socket, playerState]);

  const emitMoveStop = useCallback((position: any) => {
    if (!socket || !playerState) return;
    
    // Send a final intent to the current position to stop movement
    useGameStore.getState().sendMoveIntent({ x: position.x, z: position.z });
    
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
    
    // Handle S key for force stop
    if (e.code === 'KeyS' && playerState?.movement?.targetPos) {
      if (playerRef.current) {
        emitMoveStop(playerRef.current.translation());
      }
    }
    
  }, [isControlledPlayer, hasJumped, isGrounded, playerState, emitMoveStop]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (!isControlledPlayer) return;
    
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
        if (playerState.movement?.targetPos && targetPosition) {
          const dest = playerState.movement.targetPos;
          const speed = playerState.movement.speed || 20; // Default speed if not set
          
          console.log(`[Frame] Moving player, targetPos: (${dest.x.toFixed(2)}, ${dest.z.toFixed(2)}), speed: ${speed}`);
          
          // Use simulated movement for predictive client updates
          const isMoving = simulateMovement(playerRef.current, dest, speed, delta);
          
          if (!isMoving) {
            console.log('[Frame] Player reached destination');
            // We've arrived at destination - notify server but only once
            if (targetPosition) {
              // We've reached our destination, send a final position update
              const store = useGameStore.getState();
              store.sendMoveIntent({ 
                x: currentPosition.x, 
                z: currentPosition.z 
              });
              setTargetPosition(null);
              store.setTargetWorldPos(null);
            }
          } else {
            // Update rotation to face direction of movement
            const dir = new THREE.Vector3(dest.x - currentPosition.x, 0, dest.z - currentPosition.z).normalize();
            const targetRotation = Math.atan2(dir.x, dir.z);
            playerRef.current.setNextKinematicRotation({
              x: 0,
              y: Math.sin(targetRotation / 2),
              z: 0,
              w: Math.cos(targetRotation / 2)
            });
            
            // Update local player position in the store
            useGameStore.getState().setLocalPlayerPos({
              x: currentPosition.x,
              y: currentPosition.y,
              z: currentPosition.z
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
          const correctionVector = new THREE.Vector3().subVectors(
            serverCorrectionPositionRef.current,
            new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z)
          );
          // Apply a fraction of the correction each frame
          correctionVector.multiplyScalar(delta * 10); // Adjust speed factor as needed
          
          // Apply partial correction
          const newPos = new THREE.Vector3(
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
      if (!playerState.movement?.targetPos) {
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
    const handlePosSnap = (data: { type: string, snaps: Array<{ id: string, pos: VecXZ, vel: VecXZ, snapTs: number }> }) => {
      if (data.type !== 'PosSnap') return;
      if (!data.snaps || !Array.isArray(data.snaps)) return;
      
      // Find this player's snap in the snaps array
      const thisPlayerSnap = data.snaps.find(snap => snap && snap.id === playerId);
      if (!thisPlayerSnap || !thisPlayerSnap.pos) return;
      
      if (isControlledPlayer) {
        // For controlled player: apply correction if needed
        const currentPosition = playerRef.current?.translation();
        if (!currentPosition) return;
        
        const serverPosition = new THREE.Vector3(thisPlayerSnap.pos.x, currentPosition.y, thisPlayerSnap.pos.z);
        const distance = new THREE.Vector3(
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
              snapTs: thisPlayerSnap.snapTs
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

  // --- Listen for player position requests from skill effects ---
  useEffect(() => {
    if (!isControlledPlayer || !playerRef.current) return;

    const handleRequestPosition = (e: CustomEvent) => {
      const { callback } = e.detail;
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
export default function Player() {
  // Use the exported selectors from gameStore for proper memoization
  const playerIds = useGameStore(selectPlayerIds);
  const myPlayerId = useGameStore(selectMyPlayerId);

  // Memoize the component rendering to prevent unnecessary re-renders
  const memoizedContent = React.useMemo(() => {
    if (playerIds.length === 0) {
      return null; // No players to render yet
    }

    console.log('Rendering players:', playerIds, 'My ID:', myPlayerId);

    return (
      <group>
        {playerIds.map(id => (
          <PlayerCharacter
            key={id}
            playerId={id}
            isControlledPlayer={id === myPlayerId}
          />
        ))}
      </group>
    );
  }, [playerIds, myPlayerId]);

  return memoizedContent;
}