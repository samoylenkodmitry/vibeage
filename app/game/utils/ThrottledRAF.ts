/**
 * Throttled requestAnimationFrame utility for UI updates
 * Replaces setInterval calls that run faster than 150ms with RAF throttled to 30Hz
 */

class ThrottledRAF {
  private callbacks = new Set<() => void>();
  private rafId: number | null = null;
  private lastUpdate = 0;
  private readonly targetFPS = 30; // 30Hz instead of 60Hz
  private readonly frameInterval = 1000 / this.targetFPS;
  
  register(callback: () => void) {
    this.callbacks.add(callback);
    this.startLoop();
    
    return () => {
      this.callbacks.delete(callback);
      if (this.callbacks.size === 0) {
        this.stopLoop();
      }
    };
  }
  
  private startLoop() {
    if (this.rafId !== null) return;
    
    const loop = (timestamp: number) => {
      if (timestamp - this.lastUpdate >= this.frameInterval) {
        this.callbacks.forEach(callback => {
          try {
            callback();
          } catch (error) {
            console.error('[ThrottledRAF] Callback error:', error);
          }
        });
        this.lastUpdate = timestamp;
      }
      
      if (this.callbacks.size > 0) {
        this.rafId = requestAnimationFrame(loop);
      } else {
        this.rafId = null;
      }
    };
    
    this.rafId = requestAnimationFrame(loop);
  }
  
  private stopLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

const throttledRAF = new ThrottledRAF();

/**
 * Hook for throttled UI updates using RAF instead of setInterval
 * Use this for UI updates that need to run faster than 150ms
 */
export function useThrottledRAF(callback: () => void, enabled: boolean = true) {
  const callbackRef = React.useRef(callback);
  callbackRef.current = callback;
  
  React.useEffect(() => {
    if (!enabled) return;
    
    const wrappedCallback = () => callbackRef.current();
    return throttledRAF.register(wrappedCallback);
  }, [enabled]);
}

/**
 * Hook for frustum culling - only render components when they're potentially visible
 * This is a simplified version that checks distance from camera
 */
export function useFrustumCulling(
  position: { x: number; y: number; z: number },
  cullDistance: number = 50
) {
  const [isVisible, setIsVisible] = React.useState(true);
  
  React.useEffect(() => {
    // For now, just implement a simple distance check
    // In a more sophisticated implementation, we'd check against camera frustum
    const distance = Math.sqrt(
      position.x * position.x + 
      position.y * position.y + 
      position.z * position.z
    );
    
    setIsVisible(distance <= cullDistance);
  }, [position.x, position.y, position.z, cullDistance]);
  
  return isVisible;
}

// Add React import
import React from 'react';
