import { useState, useEffect, useRef } from 'react';
import { Vector3, Color } from 'three';
import { useFrame } from '@react-three/fiber';

export interface Particle {
  id: string;
  position: Vector3;
  velocity: Vector3;
  scale: number;
  opacity: number;
  color?: Color;
  rotation?: Vector3;
  rotationSpeed?: Vector3;
  lifetime: number;  // Current lifetime in seconds
  maxLifetime: number; // Maximum lifetime in seconds
  // Optional properties for different particle effects
  stretching?: number;
  acceleration?: Vector3;
  drag?: number;
}

export interface ParticleSystemOptions {
  initialParticles?: Particle[];
  maxParticles?: number;
  emissionRate?: number; // Particles per second
  emitterPosition?: Vector3 | (() => Vector3);
  emitterShape?: 'point' | 'sphere' | 'box' | 'cone';
  emitterRadius?: number;
  emitterSize?: Vector3;
  particleLifetime?: { min: number; max: number }; // In seconds
  particleSpeed?: { min: number; max: number };
  particleSize?: { min: number; max: number };
  particleOpacity?: { min: number; max: number };
  gravity?: Vector3;
  useCollision?: boolean;
  collisionPlaneY?: number;
  collisionDamping?: number;
  colorOverLifetime?: (progress: number) => Color;
  opacityOverLifetime?: (progress: number) => number;
  sizeOverLifetime?: (progress: number) => number;
  generateParticle?: () => Particle;
  updateParticle?: (particle: Particle, deltaTime: number) => Particle | null;
}

const defaultOptions: ParticleSystemOptions = {
  initialParticles: [],
  maxParticles: 100,
  emissionRate: 0, // Default to no continuous emission
  emitterPosition: new Vector3(0, 0, 0),
  emitterShape: 'point',
  emitterRadius: 0.5,
  emitterSize: new Vector3(1, 1, 1),
  particleLifetime: { min: 1, max: 3 },
  particleSpeed: { min: 0.5, max: 2 },
  particleSize: { min: 0.1, max: 0.3 },
  particleOpacity: { min: 0.5, max: 1 },
  gravity: new Vector3(0, -9.8, 0),
  useCollision: false,
  collisionPlaneY: 0,
  collisionDamping: 0.5,
};

const useParticleSystem = (options: ParticleSystemOptions = {}) => {
  const optionsWithDefaults = { ...defaultOptions, ...options };
  const [particles, setParticles] = useState<Particle[]>(
    optionsWithDefaults.initialParticles || []
  );
  const lastEmitTime = useRef(0);
  const isActive = useRef(true);
  
  // Generate a new particle
  const generateParticle = (): Particle => {
    if (optionsWithDefaults.generateParticle) {
      return optionsWithDefaults.generateParticle();
    }
    
    // Get emitter position (can be static or dynamic)
    const emitterPos = typeof optionsWithDefaults.emitterPosition === 'function'
      ? optionsWithDefaults.emitterPosition()
      : optionsWithDefaults.emitterPosition!;
    
    // Generate position based on emitter shape
    const position = new Vector3();
    switch (optionsWithDefaults.emitterShape) {
      case 'sphere': {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const radius = optionsWithDefaults.emitterRadius! * Math.cbrt(Math.random());
        position.set(
          emitterPos.x + radius * Math.sin(phi) * Math.cos(theta),
          emitterPos.y + radius * Math.sin(phi) * Math.sin(theta),
          emitterPos.z + radius * Math.cos(phi)
        );
        break;
      }
        
      case 'box': {
        const size = optionsWithDefaults.emitterSize!;
        position.set(
          emitterPos.x + (Math.random() - 0.5) * size.x,
          emitterPos.y + (Math.random() - 0.5) * size.y,
          emitterPos.z + (Math.random() - 0.5) * size.z
        );
        break;
      }
        
      case 'cone': {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * optionsWithDefaults.emitterRadius!;
        position.set(
          emitterPos.x + Math.cos(angle) * distance,
          emitterPos.y,
          emitterPos.z + Math.sin(angle) * distance
        );
        break;
      }
        
      case 'point':
      default:
        position.copy(emitterPos);
        break;
    }
    
    // Generate random velocity direction
    const velocityDir = new Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ).normalize();
    
    // Apply random speed
    const speed = optionsWithDefaults.particleSpeed!.min + 
      Math.random() * (optionsWithDefaults.particleSpeed!.max - optionsWithDefaults.particleSpeed!.min);
    const velocity = velocityDir.multiplyScalar(speed);
    
    // Generate other random properties
    const scale = optionsWithDefaults.particleSize!.min + 
      Math.random() * (optionsWithDefaults.particleSize!.max - optionsWithDefaults.particleSize!.min);
    const opacity = optionsWithDefaults.particleOpacity!.min + 
      Math.random() * (optionsWithDefaults.particleOpacity!.max - optionsWithDefaults.particleOpacity!.min);
    const lifetime = 0; // Start at 0
    const maxLifetime = optionsWithDefaults.particleLifetime!.min + 
      Math.random() * (optionsWithDefaults.particleLifetime!.max - optionsWithDefaults.particleLifetime!.min);
    
    return {
      id: `particle-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      position,
      velocity,
      scale,
      opacity,
      lifetime,
      maxLifetime,
      color: new Color(0xffffff),
      rotation: new Vector3(0, 0, 0),
      rotationSpeed: new Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ),
    };
  };
  
  // Update a particle for a time step
  const updateParticle = (particle: Particle, deltaTime: number): Particle | null => {
    if (optionsWithDefaults.updateParticle) {
      return optionsWithDefaults.updateParticle(particle, deltaTime);
    }
    
    // Update lifetime and check if particle should be removed
    const newLifetime = particle.lifetime + deltaTime;
    if (newLifetime >= particle.maxLifetime) {
      return null; // Remove particle
    }
    
    // Clone particle for updates
    const newParticle = { ...particle, lifetime: newLifetime };
    
    // Apply gravity
    if (optionsWithDefaults.gravity) {
      newParticle.velocity = new Vector3(
        particle.velocity.x + optionsWithDefaults.gravity.x * deltaTime,
        particle.velocity.y + optionsWithDefaults.gravity.y * deltaTime,
        particle.velocity.z + optionsWithDefaults.gravity.z * deltaTime
      );
    }
    
    // Apply velocity to position
    newParticle.position = new Vector3(
      particle.position.x + particle.velocity.x * deltaTime,
      particle.position.y + particle.velocity.y * deltaTime,
      particle.position.z + particle.velocity.z * deltaTime
    );
    
    // Apply rotation
    if (particle.rotation && particle.rotationSpeed) {
      newParticle.rotation = new Vector3(
        particle.rotation.x + particle.rotationSpeed.x * deltaTime,
        particle.rotation.y + particle.rotationSpeed.y * deltaTime,
        particle.rotation.z + particle.rotationSpeed.z * deltaTime
      );
    }
    
    // Check for collision with ground
    if (optionsWithDefaults.useCollision && 
        newParticle.position.y < optionsWithDefaults.collisionPlaneY!) {
      // Reflect off the ground with damping
      newParticle.position.y = optionsWithDefaults.collisionPlaneY!;
      newParticle.velocity.y = -newParticle.velocity.y * optionsWithDefaults.collisionDamping!;
      
      // Apply friction to horizontal velocity
      newParticle.velocity.x *= 0.9;
      newParticle.velocity.z *= 0.9;
      
      // If velocity is very small after bouncing, just stop it
      if (Math.abs(newParticle.velocity.y) < 0.1) {
        newParticle.velocity.y = 0;
      }
    }
    
    // Apply color over lifetime if provided
    if (optionsWithDefaults.colorOverLifetime && particle.color) {
      const lifetimeProgress = newParticle.lifetime / newParticle.maxLifetime;
      newParticle.color = optionsWithDefaults.colorOverLifetime(lifetimeProgress);
    }
    
    // Apply opacity over lifetime if provided
    if (optionsWithDefaults.opacityOverLifetime) {
      const lifetimeProgress = newParticle.lifetime / newParticle.maxLifetime;
      newParticle.opacity = optionsWithDefaults.opacityOverLifetime(lifetimeProgress);
    }
    
    // Apply size over lifetime if provided
    if (optionsWithDefaults.sizeOverLifetime) {
      const lifetimeProgress = newParticle.lifetime / newParticle.maxLifetime;
      newParticle.scale = optionsWithDefaults.sizeOverLifetime(lifetimeProgress);
    }
    
    return newParticle;
  };
  
  // Add new particles to the system
  const addParticles = (newParticles: Particle[]) => {
    setParticles(currentParticles => {
      // Enforce max particles limit if needed
      const combinedParticles = [...currentParticles, ...newParticles];
      if (optionsWithDefaults.maxParticles && 
          combinedParticles.length > optionsWithDefaults.maxParticles) {
        return combinedParticles.slice(-optionsWithDefaults.maxParticles);
      }
      return combinedParticles;
    });
  };
  
  // Emit a specific number of particles
  const emit = (count: number) => {
    const newParticles = Array.from({ length: count }, generateParticle);
    addParticles(newParticles);
  };
  
  // Clear all particles
  const clear = () => {
    setParticles([]);
  };
  
  // Pause/resume the particle system
  const setActive = (active: boolean) => {
    isActive.current = active;
  };
  
  // Setup continuous emission if enabled with performance optimization
  useFrame((_, delta) => {
    if (!isActive.current) return;

    // Cap delta to prevent huge frame jumps that cause performance issues
    const cappedDelta = Math.min(delta, 0.033); // Max 33ms (30 FPS minimum)
    
    const now = performance.now();
    const deltaSeconds = cappedDelta; // delta is already in seconds
    
    // Handle continuous emission if enabled
    if (optionsWithDefaults.emissionRate! > 0) {
      const timeSinceLastEmit = (now - lastEmitTime.current) / 1000; // convert to seconds
      const particlesToEmit = Math.floor(timeSinceLastEmit * optionsWithDefaults.emissionRate!);
      
      if (particlesToEmit > 0) {
        emit(particlesToEmit);
        lastEmitTime.current = now;
      }
    }
    
    // Update all particles
    setParticles(currentParticles => {
      return currentParticles
        .map(particle => updateParticle(particle, deltaSeconds))
        .filter((particle): particle is Particle => particle !== null);
    });
  });
  
  // Initialize with provided particles
  useEffect(() => {
    if (optionsWithDefaults.initialParticles && 
        optionsWithDefaults.initialParticles.length > 0) {
      setParticles(optionsWithDefaults.initialParticles);
    }
    
    lastEmitTime.current = performance.now();
    
    return () => {
      // Cleanup if needed
    };
  }, []);
  
  return {
    particles,
    emit,
    clear,
    setActive,
    addParticles,
  };
};

export default useParticleSystem;
