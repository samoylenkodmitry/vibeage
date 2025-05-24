/**
 * Generic object pool implementation for performance optimization
 * Reduces garbage collection pressure by reusing objects
 */

export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  private maxSize: number;

  constructor(
    createFn: () => T,
    resetFn: (obj: T) => void,
    initialSize: number = 10,
    maxSize: number = 100
  ) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
    
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createFn());
    }
  }

  /**
   * Get an object from the pool or create a new one
   */
  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }

  /**
   * Return an object to the pool for reuse
   */
  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.resetFn(obj);
      this.pool.push(obj);
    }
    // If pool is full, let object be garbage collected
  }

  /**
   * Get current pool size for monitoring
   */
  size(): number {
    return this.pool.length;
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.pool.length = 0;
  }
}

// Pre-configured pools for common game objects
export const Vector3Pool = new ObjectPool(
  () => ({ x: 0, y: 0, z: 0 }),
  (v) => { v.x = 0; v.y = 0; v.z = 0; },
  20, // Initial size
  100 // Max size
);

export const Vector2Pool = new ObjectPool(
  () => ({ x: 0, z: 0 }),
  (v) => { v.x = 0; v.z = 0; },
  20,
  100
);

export const PositionHistoryPool = new ObjectPool(
  () => ({ ts: 0, x: 0, z: 0 }),
  (p) => { p.ts = 0; p.x = 0; p.z = 0; },
  50,
  200
);

export const PredictionFramePool = new ObjectPool(
  () => ({ pos: { x: 0, z: 0 }, rotY: 0, ts: 0 }),
  (f) => { f.pos.x = 0; f.pos.z = 0; f.rotY = 0; f.ts = 0; },
  20,
  100
);
