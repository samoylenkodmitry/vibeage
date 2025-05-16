import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CapsuleCollider} from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore, selectPlayer, selectMyPlayerId, selectPlayerIds } from '../systems/gameStore';
import { GROUND_Y, getBuffer } from '../systems/interpolation';
import { VecXZ } from '../../../shared/messages';

// Individual Player Component
function PlayerCharacter({ playerId, isControlledPlayer }: { playerId: string, isControlledPlayer: boolean }) {
  const playerRef = useRef<any>(null);
  const playerState = useGameStore(selectPlayer(playerId));
  const socket = useGameStore(state => state.socket);

  // --- Hooks and State specific to the controlled player ---
  const { camera, gl, raycaster } = useThree();
  const [isGrounded] = useState(false);
  const [hasJumped, setHasJumped] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const cameraAngleRef = useRef(Math.PI);
  const movementTimestampRef = useRef(0);

  // Initialize camera angle
  useEffect(() => {
    if (isControlledPlayer) {
      // Initialize with default value
      cameraAngleRef.current = Math.PI;
      
      // Dispatch initial angle to ensure the camera starts at the correct angle
      window.dispatchEvent(new CustomEvent('cameraAngleChange', { 
        detail: { angle: cameraAngleRef.current } 
      }));
    }
  }, [isControlledPlayer]);

  // Used for ground plane intersection calculations
  const moveDirection = useRef({ forward: 0, right: 0, jump: false });
  
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
          
          // Create target position, ensuring Y is at ground level
          const newTarget = new THREE.Vector3(rayPos.x, GROUND_Y, rayPos.z);
          console.log('Setting movement target:', newTarget);
          
          // Record movement timestamp to prevent camera rotation during movement
          movementTimestampRef.current = Date.now();
        
          // Get reference to store to ensure we're using the proper state
          const store = useGameStore.getState();
          
          // Set target in global store for reference
          store.setTargetWorldPos(newTarget);
          
          // Send network message with move intent
          // The server will handle the movement and send back position updates
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

  const emitMoveStop = useCallback((position: THREE.Vector3) => {
    if (!socket || !playerState) return;
    
    // Send a final intent to the current position to stop movement
    useGameStore.getState().sendMoveIntent({ x: position.x, z: position.z });
    
    // Clear target in global store
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
    // Update the local ref directly
    cameraAngleRef.current = cameraAngleRef.current - deltaX * 0.02;
    
    // Dispatch a custom event to notify the camera of the angle change
    window.dispatchEvent(new CustomEvent('cameraAngleChange', { 
      detail: { angle: cameraAngleRef.current } 
    }));
    
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
        const position = playerRef.current.translation();
        emitMoveStop(position);
      }
    }
  }, [isControlledPlayer, hasJumped, isGrounded, playerState, emitMoveStop]);

  const handleKeyUp = useCallback(() => {
    // Empty handler kept for future use
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

  // --- Update Player.tsx useFrame handler to use position snapshots from the module-global buffer ---
  useFrame(() => {
    if (!playerRef.current || !playerState) return;

    try {
      const buf = getBuffer(playerId);
      const lag = 200;
      const tick = performance.now() - lag;
      const s = buf.sample(tick);
      
      if (s) {
          // Use server position directly without any interpolation
          const serverPos = new THREE.Vector3(s.pos.x, GROUND_Y, s.pos.z);
          
          // Check if server considers player stopped
          const serverConsideredStopped = s.vel ? (Math.abs(s.vel.x) < 0.001 && Math.abs(s.vel.z) < 0.001) : true;
          
          // Get client-side targetWorldPos for comparison
          const targetWorldPos = isControlledPlayer ? useGameStore.getState().targetWorldPos : null;

          // Always apply server position directly - no interpolation
          playerRef.current.setNextKinematicTranslation({
            x: serverPos.x,
            y: serverPos.y,
            z: serverPos.z
          });

          
          // If this is the controlled player and server indicates stopped,
          // clear the target indicator (yellow ring)
          if (isControlledPlayer && serverConsideredStopped && targetWorldPos !== null) {
            useGameStore.getState().setTargetWorldPos(null);
          }
          
          // Apply rotation directly from server
          playerRef.current.setNextKinematicRotation({
            x: 0,
            y: Math.sin(s.rot/2),
            z: 0,
            w: Math.cos(s.rot/2)
          });
          
          // Update controlled player render position for other systems
          if (isControlledPlayer) {
            const currentGameStorePos = useGameStore.getState().controlledPlayerRenderPosition;
            
            // Get the position directly from the physics body after we've updated it
            const updatedPos = playerRef.current.translation();
            
            // Only update if position changed significantly or if we don't have a position yet
            const shouldUpdate = !currentGameStorePos || 
              Math.abs(updatedPos.x - (currentGameStorePos?.x || 0)) > 0.01 || 
              Math.abs(updatedPos.z - (currentGameStorePos?.z || 0)) > 0.01;
              
            if (shouldUpdate) {
              useGameStore.getState().setControlledPlayerRenderPosition({
                x: updatedPos.x,
                y: updatedPos.y,
                z: updatedPos.z
              });
            }
          }
      }      
    } catch (err) {
      console.error("Error in useFrame handler:", err);
    }
  });

  // --- Effect to handle server corrections for controlled player ---
  useEffect(() => {
    if (!socket) return;

    // Handle position updates from server - just for logging/debugging purposes
    const handlePosSnap = (data: { type: string, snaps: Array<{ id: string, pos: VecXZ, vel: VecXZ, snapTs: number }> }) => {
      if (data.type !== 'PosSnap') return;
      if (!data.snaps || !Array.isArray(data.snaps)) return;
      
      // Find this player's snap in the snaps array
      const thisPlayerSnap = data.snaps.find(snap => snap && snap.id === playerId);
      if (!thisPlayerSnap || !thisPlayerSnap.pos) return;
      
      // For debugging only - log significant position jumps for the controlled player
      if (isControlledPlayer && playerRef.current) {
        const currentPosition = playerRef.current.translation();
        if (!currentPosition) return;
        
        const serverPos = thisPlayerSnap.pos;
        const distance = Math.sqrt(
          Math.pow(serverPos.x - currentPosition.x, 2) + 
          Math.pow(serverPos.z - currentPosition.z, 2)
        );
        
        // Only log if the difference is significant and reduce frequency
        if (distance > 3.0 && Math.random() < 0.3) {
          console.log(`Position difference detected: ${distance.toFixed(2)} units`);
          
          // If distance is extremely large (teleport-like), implement stronger smoothing
          if (distance > 10.0) {
            console.log(`Large teleport detected: (${currentPosition.x.toFixed(2)}, ${currentPosition.z.toFixed(2)}) → (${serverPos.x.toFixed(2)}, ${serverPos.z.toFixed(2)})`);
            
          }
        }
      }
    };
    
    // Listen for position snapshots
    socket.on('msg', handlePosSnap);
    
    return () => {
      socket.off('msg', handlePosSnap);
    };
  }, [playerId, socket, isControlledPlayer]);

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

  // Render the player model
  if (!playerState) return null; // Don't render if state doesn't exist yet

  return (
    <>
      <RigidBody
        ref={playerRef}
        position={[playerState.position.x, playerState.position.y, playerState.position.z]} // Initial position from store
        enabledRotations={[false, true, false]} // Allow Y rotation for facing direction
        colliders={false}
        mass={isControlledPlayer ? 10 : 1}
        type="kinematicPosition" // Both controlled and remote players use kinematic positioning
        lockRotations={!isControlledPlayer} // Lock rotation for non-controlled players if needed
        linearDamping={isControlledPlayer ? 0.5 : 0}
        angularDamping={isControlledPlayer ? 0.95 : 0}
        friction={isControlledPlayer ? 0.2 : 0}
        restitution={0.0}
        gravityScale={0} // Disable gravity for all players - server handles physics
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

    </>
  );
}

// Main Players Component (Renders all players)
export default function Player() {
  const playerIds = useGameStore(selectPlayerIds);
  const myPlayerId = useGameStore(selectMyPlayerId);

  return (
    <>
      {playerIds.map(id => (
        <PlayerCharacter 
          key={id} 
          playerId={id} 
          isControlledPlayer={id === myPlayerId} 
        />
      ))}
    </>
  );
}