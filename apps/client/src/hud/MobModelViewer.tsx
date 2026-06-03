import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AnimatedCharacter } from '../AnimatedCharacter';
import { AssetErrorBoundary } from '../world-art/AssetErrorBoundary';
import { enemyModel } from '../characterModels';
import { getEnemyVisual } from '../worldVisuals';

/**
 * Small in-engine model thumbnail for a wiki mob entry — the same rig + tint the
 * player sees in the world, slowly turning. The R3F canvas is **lazy**: it only
 * mounts while scrolled into view (IntersectionObserver) and unmounts when it
 * leaves, so a long mob list never exceeds the browser's live-WebGL-context cap.
 */

function Spin({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.6; });
  return <group ref={ref}>{children}</group>;
}

export function MobModelViewer({ family, type }: { family: string; type: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setShow(entry.isIntersecting), { rootMargin: '150px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const tint = getEnemyVisual(type)?.color;
  return (
    <div ref={host} className="wiki-mob-model" aria-hidden="true">
      {show && (
        <Canvas
          camera={{ position: [0, 0.25, 3.0], fov: 40, near: 0.1, far: 50 }}
          gl={{ powerPreference: 'low-power', antialias: true }}
          dpr={[1, 1.5]}
        >
          <hemisphereLight args={['#cfe0ff', '#2a3450', 1.2]} />
          <directionalLight position={[3, 5, 4]} intensity={1.5} />
          {/* A model load failure renders nothing instead of crashing the wiki. */}
          <AssetErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              {/* Lower so the body centres on the camera target. */}
              <group position={[0, -0.85, 0]}>
                <Spin>
                  <AnimatedCharacter modelId={enemyModel(family)} state="idle" targetHeight={1.7} tint={tint} />
                </Spin>
              </group>
            </Suspense>
          </AssetErrorBoundary>
        </Canvas>
      )}
    </div>
  );
}
