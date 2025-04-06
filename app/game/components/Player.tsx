'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import { Vector3, Euler, Raycaster, Plane, Mesh, Vector2 } from 'three';
import { useGameStore } from '../systems/gameStore';

// Define GROUND_POSITION_Y constant
const GROUND_POSITION_Y = 0.5;

export default function Player() {
  const playerRef = useRef<any>(null);
  const movePlayer = useGameStore(state => state.movePlayer);
  const rotatePlayer = useGameStore(state => state.rotatePlayer);
  const playerPosition = useGameStore(state => state.player.position);
  const [isGrounded, setIsGrounded] = useState(false);
  const [hasJumped, setHasJumped] = useState(false);
  const { rapier, world } = useRapier();
  
  // Target destination for click-to-move
  const [targetPosition, setTargetPosition] = useState<Vector3 | null>(null);
  const targetMarkerRef = useRef<Mesh>(null);
  
  // Movement tracking
  const movementStartTime = useRef<number | null>(null);
  const lastDistanceToTarget = useRef<number>(Infinity);
  const stuckCounter = useRef(0);
  
  // Camera rotation control
  const [isRotating, setIsRotating] = useState(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  // Store camera angle to persist rotation - initialize with Math.PI to face player forward
  const cameraAngleRef = useRef(Math.PI);
  const cameraInitialized = useRef(false);
  
  // Get Three.js instances
  const { camera, gl, raycaster, pointer } = useThree();
  const groundPlane = new Plane(new Vector3(0, 1, 0), -GROUND_POSITION_Y); // Adjusted to properly align with the ground height
  
  const moveDirection = useRef({ forward: 0, right: 0, jump: false });
  const velocity = useRef(new Vector3());
  const playerSpeed = 10; // Reduced from 15 for even better control
  const jumpForce = 8; // Reduced from 10 for more controlled jumps
  const rotationSpeed = 1.5; // Reduced from 2 for smoother rotation
  
  // Movement thresholds
  const MOVEMENT_PRECISION = 0.1; // Increased from 0.03 for smoother stopping
  const STUCK_THRESHOLD = 0.005;
  const TARGET_REACHED_THRESHOLD = 0.3; // Increased from 0.2 for smoother stopping
  
  // Track the last position to detect when grounded
  const lastPositionY = useRef(0);

  const handleMouseClick = useCallback((e: MouseEvent) => {
    // Skip if right mouse button or if we're rotating
    if (e.button !== 0 || isRotating) return;
    
    // Check if the click originated from an element with pointer-events-auto class
    // This indicates it's a UI element and we should ignore the click for world interaction
    if ((e.target as HTMLElement).closest('.pointer-events-auto')) {
      console.log('Click on UI element detected, ignoring world interaction');
      return;
    }
    
    // Calculate intersection with ground plane
    const mouse = new Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    
    // Update raycaster with current mouse position
    raycaster.setFromCamera(mouse, camera);
    
    // Find intersection with ground plane
    const intersectPoint = new Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, intersectPoint)) {
      console.log("Setting target position:", intersectPoint);
      // Reset tracking variables when setting new target
      movementStartTime.current = Date.now();
      lastDistanceToTarget.current = Infinity;
      stuckCounter.current = 0;
      
      // Set new target position
      setTargetPosition(new Vector3(intersectPoint.x, GROUND_POSITION_Y, intersectPoint.z));
    } else {
      console.log("Ray miss - no intersection with ground plane");
    }
  }, [isRotating, camera, raycaster, groundPlane]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 2) {
      console.log("Right mouse button pressed - starting camera rotation");
      setIsRotating(true);
      previousMousePosition.current.x = e.clientX;
      previousMousePosition.current.y = e.clientY;
      document.body.style.cursor = 'grabbing';
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (e.button === 2) {
      console.log("Right mouse button released - stopping camera rotation");
      setIsRotating(false);
      document.body.style.cursor = 'default';
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isRotating) return;
    
    const deltaX = e.clientX - previousMousePosition.current.x;
    cameraAngleRef.current -= deltaX * 0.02;
    
    previousMousePosition.current.x = e.clientX;
    previousMousePosition.current.y = e.clientY;
    e.preventDefault();
    e.stopPropagation();
  }, [isRotating]);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space' && isGrounded && !hasJumped) {
      moveDirection.current.jump = true;
      setHasJumped(true);
    }
  }, [isGrounded, hasJumped]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space') {
      moveDirection.current.jump = false;
    }
  }, []);

  // Handle mouse input for movement and camera control
  useEffect(() => {
    // Initialize camera angle only once
    if (!cameraInitialized.current) {
      cameraAngleRef.current = Math.PI; // Default looking behind player
      cameraInitialized.current = true;
    }

    window.addEventListener('click', handleMouseClick);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Make cursor visible by default
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
  }, [handleMouseClick, handleMouseDown, handleMouseUp, handleMouseMove, handleContextMenu, handleKeyDown, handleKeyUp]);
  
  // Handle player movement and camera follow
  useFrame((state, delta) => {
    if (!playerRef.current) return;
    
    // Get the current position and velocity
    const position = playerRef.current.translation();
    const currentVelocity = playerRef.current.linvel();
    
    // More accurate ground detection using raycasting
    const origin = { x: position.x, y: position.y + 0.1, z: position.z };
    const direction = { x: 0, y: -1, z: 0 };
    const rayLength = 0.8;
    
    // Check if there's a ray hit with the ground
    const ray = new rapier.Ray(origin, direction);
    const hit = world.castRay(ray, rayLength, true);
    const rayHit = hit !== null;
    
    // Alternative ground detection method for stability
    const isNearGround = Math.abs(position.y - GROUND_POSITION_Y) < 0.2;
    const isNotRising = currentVelocity.y <= 0.01; // Very small threshold
    
    // Combined detection strategy - prioritize being at exact ground level
    const nowGrounded = (rayHit || isNearGround) && isNotRising;
    
    // Update grounded state
    if (nowGrounded !== isGrounded) {
      setIsGrounded(nowGrounded);
      
      // Reset jump flag when landing
      if (nowGrounded && hasJumped) {
        setHasJumped(false);
      }
    }
    
    // Force player to ground position if they are considered grounded
    if (isGrounded) {
      // Stop vertical movement entirely
      playerRef.current.setLinvel({
        x: currentVelocity.x,
        y: 0,
        z: currentVelocity.z
      });
      
      // Fix position exactly at ground level
      if (Math.abs(position.y - GROUND_POSITION_Y) > 0.01) {
        playerRef.current.setTranslation({
          x: position.x,
          y: GROUND_POSITION_Y,
          z: position.z
        });
      }
    }
    
    // Click-to-move logic
    if (targetPosition && isGrounded) {
      const direction = new Vector3(
        targetPosition.x - position.x,
        0,
        targetPosition.z - position.z
      );
      
      const distanceToTarget = direction.length();
      
      if (distanceToTarget > MOVEMENT_PRECISION && stuckCounter.current < 60) {
        direction.normalize();
        
        // Gradually reduce speed as we get closer to target
        const speedMultiplier = Math.min(distanceToTarget, 1.5);
        
        // Apply movement with smoothed velocity
        playerRef.current.setLinvel({
          x: direction.x * playerSpeed * speedMultiplier,
          y: currentVelocity.y,
          z: direction.z * playerSpeed * speedMultiplier
        });
        
        // Rotate player to face movement direction
        const targetRotation = Math.atan2(direction.x, direction.z);
        rotatePlayer(targetRotation);
        
        lastDistanceToTarget.current = distanceToTarget;
      } else {
        // Stop more gradually
        const currentSpeed = new Vector3(currentVelocity.x, 0, currentVelocity.z).length();
        if (currentSpeed > 0.1) {
          playerRef.current.setLinvel({
            x: currentVelocity.x * 0.8,
            y: currentVelocity.y,
            z: currentVelocity.z * 0.8
          });
        } else {
          playerRef.current.setLinvel({
            x: 0,
            y: currentVelocity.y,
            z: 0
          });
        }
        
        // Only place exactly at target if very close
        if (distanceToTarget <= TARGET_REACHED_THRESHOLD) {
          playerRef.current.setTranslation({
            x: targetPosition.x,
            y: GROUND_POSITION_Y,
            z: targetPosition.z
          });
          setTargetPosition(null);
        }
      }
    }
    
    // Apply jump if requested and grounded
    if (moveDirection.current.jump && isGrounded && !hasJumped) {
      // Set exact velocity for jumping
      playerRef.current.setLinvel({ 
        x: currentVelocity.x * 0.5, 
        y: jumpForce, 
        z: currentVelocity.z * 0.5 
      });
      moveDirection.current.jump = false;
    }
    
    // Get position and update store
    movePlayer(position.x, position.y, position.z);
    
    // Camera positions are handled separately - don't reset them here
    
    // Save last position for next frame comparison
    lastPositionY.current = position.y;
  });
  
  // Separate camera logic to prevent camera from resetting to initial position
  useFrame((state, delta) => {
    if (!playerRef.current) return;
    
    const position = playerRef.current.translation();
    
    // Always use stored angle for camera positioning, regardless of rotation state
    const distance = 15; // Much closer camera distance
    const height = 10;   // Lower height for closer, more immersive view
    
    // Ensure we use the stored camera angle, not reset it
    const angle = cameraAngleRef.current;
    
    // Position camera relative to player based on current camera angle
    camera.position.x = position.x - Math.sin(angle) * distance;
    camera.position.y = position.y + height;
    camera.position.z = position.z - Math.cos(angle) * distance;
    
    // Make camera look at player
    camera.lookAt(position.x, position.y + 1.0, position.z);
    
    // Persist the camera angle in the game state to ensure it doesn't reset
    // This ensures other components don't reset our camera angle
    rotatePlayer(angle);
  });

  return (
    <>
      <RigidBody
        ref={playerRef}
        position={[playerPosition.x, GROUND_POSITION_Y, playerPosition.z]}
        enabledRotations={[false, false, false]}
        colliders={false}
        mass={10} // Reduced mass for more responsive movement
        type="dynamic"
        lockRotations
        linearDamping={0.5} // Reduced damping for better movement
        angularDamping={0.95}
        friction={0.2} // Reduced friction for smoother movement
        restitution={0.0}
        gravityScale={2}
        ccd={true}
      >
        <CapsuleCollider args={[0.5, 0.6]} friction={0.2} restitution={0} />
        
        {/* Character model (simple placeholder) */}
        <group>
          {/* Body */}
          <mesh castShadow position={[0, 0, 0]}>
            <capsuleGeometry args={[0.5, 1.2, 8, 16]} />
            <meshStandardMaterial color="#3870c4" />
          </mesh>
          
          {/* Head */}
          <mesh castShadow position={[0, 1, 0]}>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial color="#f5deb3" />
          </mesh>
        </group>
      </RigidBody>
      
      {/* Target marker */}
      {targetPosition && (
        <mesh position={targetPosition} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.5, 16]} />
          <meshBasicMaterial color="#ffff00" transparent opacity={0.6} />
        </mesh>
      )}
    </>
  );
}