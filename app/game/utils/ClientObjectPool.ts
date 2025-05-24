/**
 * Client-side Object Pool for Three.js objects and particle systems
 * Reduces garbage collection pressure from frequent VFX object creation
 */

import { Vector3, Mesh, Group, Color, SphereGeometry, BoxGeometry, IcosahedronGeometry, DodecahedronGeometry, MeshStandardMaterial, MeshBasicMaterial, PointLight } from 'three';

// Interfaces for pooled objects
interface PooledParticle {
  id: string;
  position: Vector3;
  velocity: Vector3;
  scale: number;
  opacity: number;
  lifetime: number;
  maxLifetime: number;
  color?: Color;
  rotation?: Vector3;
  rotationSpeed?: Vector3;
}

interface PooledMesh {
  mesh: Mesh;
  inUse: boolean;
}

interface PooledGroup {
  group: Group;
  inUse: boolean;
}

interface PooledLight {
  light: PointLight;
  inUse: boolean;
}

// Base object pool class
abstract class ObjectPool<T> {
  protected pool: T[] = [];
  protected initialSize: number;
  protected maxSize: number;
  protected createCount: number = 0;

  constructor(initialSize: number = 10, maxSize: number = 100) {
    this.initialSize = initialSize;
    this.maxSize = maxSize;
    this.preAllocate();
  }

  protected abstract createObject(): T;
  protected abstract resetObject(obj: T): void;

  private preAllocate(): void {
    for (let i = 0; i < this.initialSize; i++) {
      this.pool.push(this.createObject());
      this.createCount++;
    }
  }

  acquire(): T {
    let obj = this.pool.pop();
    
    if (!obj) {
      // Pool is empty, create new object if under max size
      if (this.createCount < this.maxSize) {
        obj = this.createObject();
        this.createCount++;
      } else {
        // Force reuse of oldest object
        console.warn(`[ObjectPool] Max size reached (${this.maxSize}), forcing object reuse`);
        obj = this.createObject(); // Create temporary object
      }
    }
    
    this.resetObject(obj);
    return obj;
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
    // If pool is full, let the object be garbage collected
  }

  getStats() {
    return {
      poolSize: this.pool.length,
      totalCreated: this.createCount,
      activeObjects: this.createCount - this.pool.length
    };
  }
}

// Vector3 Pool for position/velocity calculations
class Vector3ObjectPool extends ObjectPool<Vector3> {
  protected createObject(): Vector3 {
    return new Vector3();
  }

  protected resetObject(obj: Vector3): void {
    obj.set(0, 0, 0);
  }

  acquireWithValues(x: number, y: number, z: number): Vector3 {
    const vec = this.acquire();
    vec.set(x, y, z);
    return vec;
  }

  acquireFromVector(source: Vector3): Vector3 {
    const vec = this.acquire();
    vec.copy(source);
    return vec;
  }
}

// Color Pool for particle systems
class ColorObjectPool extends ObjectPool<Color> {
  protected createObject(): Color {
    return new Color();
  }

  protected resetObject(obj: Color): void {
    obj.setRGB(1, 1, 1);
  }

  acquireWithHSL(h: number, s: number, l: number): Color {
    const color = this.acquire();
    color.setHSL(h, s, l);
    return color;
  }

  acquireWithHex(hex: number | string): Color {
    const color = this.acquire();
    if (typeof hex === 'string') {
      color.setStyle(hex);
    } else {
      color.setHex(hex);
    }
    return color;
  }
}

// Particle Pool for VFX systems
class ParticleObjectPool extends ObjectPool<PooledParticle> {
  private particleIdCounter = 0;

  protected createObject(): PooledParticle {
    return {
      id: `particle-${++this.particleIdCounter}`,
      position: new Vector3(),
      velocity: new Vector3(),
      scale: 1,
      opacity: 1,
      lifetime: 0,
      maxLifetime: 1,
      color: new Color(1, 1, 1),
      rotation: new Vector3(),
      rotationSpeed: new Vector3()
    };
  }

  protected resetObject(obj: PooledParticle): void {
    obj.id = `particle-${++this.particleIdCounter}`;
    obj.position.set(0, 0, 0);
    obj.velocity.set(0, 0, 0);
    obj.scale = 1;
    obj.opacity = 1;
    obj.lifetime = 0;
    obj.maxLifetime = 1;
    obj.color?.setRGB(1, 1, 1);
    obj.rotation?.set(0, 0, 0);
    obj.rotationSpeed?.set(0, 0, 0);
  }
}

// Mesh Pool for Three.js geometries
class MeshObjectPool extends ObjectPool<PooledMesh> {
  private geometryType: 'sphere' | 'box' | 'icosahedron' | 'dodecahedron';
  private materialType: 'standard' | 'basic';

  constructor(
    geometryType: 'sphere' | 'box' | 'icosahedron' | 'dodecahedron' = 'sphere',
    materialType: 'standard' | 'basic' = 'standard',
    initialSize: number = 10,
    maxSize: number = 50
  ) {
    super(initialSize, maxSize);
    this.geometryType = geometryType;
    this.materialType = materialType;
  }

  protected createObject(): PooledMesh {
    let geometry;
    switch (this.geometryType) {
      case 'box':
        geometry = new BoxGeometry(1, 1, 1);
        break;
      case 'icosahedron':
        geometry = new IcosahedronGeometry(1, 0);
        break;
      case 'dodecahedron':
        geometry = new DodecahedronGeometry(1, 0);
        break;
      default:
        geometry = new SphereGeometry(1, 8, 8);
    }

    let material;
    if (this.materialType === 'basic') {
      material = new MeshBasicMaterial({ color: 0xffffff, transparent: true });
    } else {
      material = new MeshStandardMaterial({ color: 0xffffff, transparent: true });
    }

    const mesh = new Mesh(geometry, material);
    return { mesh, inUse: false };
  }

  protected resetObject(obj: PooledMesh): void {
    obj.inUse = false;
    obj.mesh.position.set(0, 0, 0);
    obj.mesh.rotation.set(0, 0, 0);
    obj.mesh.scale.set(1, 1, 1);
    obj.mesh.visible = true;
    
    // Reset material properties
    if (obj.mesh.material instanceof MeshBasicMaterial) {
      obj.mesh.material.opacity = 1;
      obj.mesh.material.color.setRGB(1, 1, 1);
    } else if (obj.mesh.material instanceof MeshStandardMaterial) {
      obj.mesh.material.opacity = 1;
      obj.mesh.material.color.setRGB(1, 1, 1);
      obj.mesh.material.emissive.setRGB(0, 0, 0);
      obj.mesh.material.emissiveIntensity = 0;
    }
  }

  acquireMesh(): Mesh {
    const pooledMesh = super.acquire();
    pooledMesh.inUse = true;
    return pooledMesh.mesh;
  }

  releaseMesh(mesh: Mesh): void {
    // Find the pooled mesh container
    const pooledMesh = this.pool.find(p => p.mesh === mesh);
    if (pooledMesh) {
      this.resetObject(pooledMesh);
      super.release(pooledMesh);
    }
  }
}

// Group Pool for Three.js Groups
class GroupObjectPool extends ObjectPool<PooledGroup> {
  protected createObject(): PooledGroup {
    return { group: new Group(), inUse: false };
  }

  protected resetObject(obj: PooledGroup): void {
    obj.inUse = false;
    obj.group.position.set(0, 0, 0);
    obj.group.rotation.set(0, 0, 0);
    obj.group.scale.set(1, 1, 1);
    obj.group.visible = true;
    
    // Clear all children
    while (obj.group.children.length > 0) {
      obj.group.remove(obj.group.children[0]);
    }
  }

  acquireGroup(): Group {
    const pooledGroup = super.acquire();
    pooledGroup.inUse = true;
    return pooledGroup.group;
  }

  releaseGroup(group: Group): void {
    const pooledGroup = this.pool.find(p => p.group === group);
    if (pooledGroup) {
      this.resetObject(pooledGroup);
      super.release(pooledGroup);
    }
  }
}

// Light Pool for Three.js PointLights
class LightObjectPool extends ObjectPool<PooledLight> {
  protected createObject(): PooledLight {
    return { light: new PointLight(0xffffff, 1, 10), inUse: false };
  }

  protected resetObject(obj: PooledLight): void {
    obj.inUse = false;
    obj.light.position.set(0, 0, 0);
    obj.light.color.setRGB(1, 1, 1);
    obj.light.intensity = 1;
    obj.light.distance = 10;
    obj.light.visible = true;
  }

  acquireLight(): PointLight {
    const pooledLight = super.acquire();
    pooledLight.inUse = true;
    return pooledLight.light;
  }

  releaseLight(light: PointLight): void {
    const pooledLight = this.pool.find(p => p.light === light);
    if (pooledLight) {
      this.resetObject(pooledLight);
      super.release(pooledLight);
    }
  }
}

// Exported pool instances
export const Vector3Pool = new Vector3ObjectPool(20, 200);
export const ColorPool = new ColorObjectPool(15, 100);
export const ParticlePool = new ParticleObjectPool(50, 500);

// Mesh pools for different VFX types with wrapper interface
const sphereMeshPool = new MeshObjectPool('sphere', 'standard', 20, 100);
const boxMeshPool = new MeshObjectPool('box', 'standard', 10, 50);
const icosahedronMeshPool = new MeshObjectPool('icosahedron', 'standard', 10, 50);
const dodecahedronMeshPool = new MeshObjectPool('dodecahedron', 'standard', 10, 50);
const basicSphereMeshPool = new MeshObjectPool('sphere', 'basic', 30, 150);
const basicBoxMeshPool = new MeshObjectPool('box', 'basic', 20, 100);

// Create wrapper objects with acquire/release methods
export const SphereMeshPool = {
  acquire: () => sphereMeshPool.acquireMesh(),
  release: (mesh: Mesh) => sphereMeshPool.releaseMesh(mesh),
  getStats: () => sphereMeshPool.getStats()
};

export const BoxMeshPool = {
  acquire: () => boxMeshPool.acquireMesh(),
  release: (mesh: Mesh) => boxMeshPool.releaseMesh(mesh),
  getStats: () => boxMeshPool.getStats()
};

export const IcosahedronMeshPool = {
  acquire: () => icosahedronMeshPool.acquireMesh(),
  release: (mesh: Mesh) => icosahedronMeshPool.releaseMesh(mesh),
  getStats: () => icosahedronMeshPool.getStats()
};

export const DodecahedronMeshPool = {
  acquire: () => dodecahedronMeshPool.acquireMesh(),
  release: (mesh: Mesh) => dodecahedronMeshPool.releaseMesh(mesh),
  getStats: () => dodecahedronMeshPool.getStats()
};

export const BasicSphereMeshPool = {
  acquire: () => basicSphereMeshPool.acquireMesh(),
  release: (mesh: Mesh) => basicSphereMeshPool.releaseMesh(mesh),
  getStats: () => basicSphereMeshPool.getStats()
};

export const BasicBoxMeshPool = {
  acquire: () => basicBoxMeshPool.acquireMesh(),
  release: (mesh: Mesh) => basicBoxMeshPool.releaseMesh(mesh),
  getStats: () => basicBoxMeshPool.getStats()
};

// Cone mesh pool for ice bolts and other cone-shaped VFX  
// Using sphere mesh as placeholder - cone geometry creates complexity
export const ConeMeshPool = BasicSphereMeshPool;

// Group and Light pool instances
const groupPool = new GroupObjectPool(15, 75);
const lightPool = new LightObjectPool(10, 50);

// Export wrapper objects for Group and Light pools
export const GroupPool = {
  acquire: () => groupPool.acquireGroup(),
  release: (group: Group) => groupPool.releaseGroup(group),
  getStats: () => groupPool.getStats()
};

export const LightPool = {
  acquire: () => lightPool.acquireLight(),
  release: (light: PointLight) => lightPool.releaseLight(light),
  getStats: () => lightPool.getStats()
};

// Utility function to get stats from all pools
export function getClientPoolStats() {
  return {
    vector3: Vector3Pool.getStats(),
    color: ColorPool.getStats(),
    particle: ParticlePool.getStats(),
    sphereMesh: SphereMeshPool.getStats(),
    boxMesh: BoxMeshPool.getStats(),
    icosahedronMesh: IcosahedronMeshPool.getStats(),
    dodecahedronMesh: DodecahedronMeshPool.getStats(),
    basicSphereMesh: BasicSphereMeshPool.getStats(),
    basicBoxMesh: BasicBoxMeshPool.getStats(),
    coneMesh: ConeMeshPool.getStats(),
    group: GroupPool.getStats(),
    light: LightPool.getStats()
  };
}

// Performance monitoring function
export function logClientPoolStats() {
  const stats = getClientPoolStats();
  console.log('[ClientObjectPool] Pool Statistics:', stats);
  
  // Warning for high usage
  Object.entries(stats).forEach(([poolName, stat]) => {
    const usagePercent = ((stat.totalCreated - stat.poolSize) / stat.totalCreated) * 100;
    if (usagePercent > 80) {
      console.warn(`[ClientObjectPool] High usage in ${poolName} pool: ${usagePercent.toFixed(1)}%`);
    }
  });
}
