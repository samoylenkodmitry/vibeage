import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * WebGL availability gate. When the browser's GPU process has died (after
 * repeated context losses, GPU resets, or driver crashes) EVERY context
 * request fails — and mounting the R3F Canvas anyway produced an infinite
 * retry storm (thousands of "Error creating WebGL context" logs) over a
 * blank world while the DOM HUD kept running. Probe once, and if graphics
 * are unavailable render a human explanation with a retry button instead.
 */
let cachedProbe: boolean | null = null;

function probeWebGL(force: boolean): boolean {
  if (cachedProbe !== null && !force) return cachedProbe;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    cachedProbe = !!gl;
    // Deliberately do NOT call WEBGL_lose_context.loseContext() here: that
    // logs a `CONTEXT_LOST_WEBGL: loseContext: context lost` line that looks
    // exactly like the renderer dying — alarming noise that masked the REAL
    // main-canvas context-loss events. The throwaway probe context is freed
    // when its canvas is garbage-collected (we cache the result so we create
    // at most one probe context per page load + one per manual retry).
  } catch {
    cachedProbe = false;
  }
  return cachedProbe;
}

export function WebGLGate({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  // Re-probe (force, ignoring the cache) only on an explicit retry click; the
  // initial mount uses the cached probe so remounts don't spawn contexts.
  const available = useMemo(() => probeWebGL(attempt > 0), [attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  if (available) return <>{children}</>;
  return (
    <div role="alert" style={OVERLAY_STYLE}>
      <div style={{ maxWidth: 420 }}>
        <h2 style={{ margin: '0 0 0.5rem' }}>Graphics unavailable</h2>
        <p style={{ margin: '0 0 1rem', opacity: 0.85 }}>
          Your browser couldn&apos;t create a 3D graphics context — its GPU process has likely
          crashed. Fully restarting the browser usually fixes this (check chrome://gpu).
          The game world can&apos;t render until then.
        </p>
        <button type="button" onClick={retry} style={BUTTON_STYLE}>Try again</button>
      </div>
    </div>
  );
}

/**
 * Lives INSIDE the Canvas. Reports main-canvas WebGL context loss/restore up
 * to the parent so it can show {@link RendererContextLostOverlay}. The context
 * dies under GPU pressure (a competing ML workload, driver reset); WorldScene
 * already preventDefaults the loss so the browser is allowed to restore it.
 */
export function RendererContextLossGuard({ onChange }: { onChange: (lost: boolean) => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const el = gl.domElement;
    const onLost = () => onChange(true);
    const onRestored = () => onChange(false);
    el.addEventListener('webglcontextlost', onLost);
    el.addEventListener('webglcontextrestored', onRestored);
    return () => {
      el.removeEventListener('webglcontextlost', onLost);
      el.removeEventListener('webglcontextrestored', onRestored);
      onChange(false);
    };
  }, [gl, onChange]);
  return null;
}

/**
 * DOM overlay shown while the main render context is lost. The frame freezes
 * (often to white) during the loss, so without this the user faced a silent
 * white void. If the GPU recovers the browser fires webglcontextrestored and
 * the overlay vanishes; if it doesn't recover within a few seconds we surface
 * a Reload button rather than leaving them stuck.
 */
export function RendererContextLostOverlay() {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setStuck(true), 6000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div role="alert" style={OVERLAY_STYLE}>
      <div style={{ maxWidth: 420 }}>
        <h2 style={{ margin: '0 0 0.5rem' }}>Graphics paused</h2>
        <p style={{ margin: '0 0 1rem', opacity: 0.85 }}>
          The GPU dropped the 3D render context — usually because it&apos;s under heavy load.
          {stuck ? ' It hasn’t recovered on its own.' : ' Trying to recover…'}
        </p>
        {stuck && (
          <button type="button" onClick={() => window.location.reload()} style={BUTTON_STYLE}>
            Reload
          </button>
        )}
      </div>
    </div>
  );
}

const OVERLAY_STYLE = {
  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#10141c', color: '#dbe4f0', textAlign: 'center', padding: '2rem', zIndex: 5,
} as const;

const BUTTON_STYLE = {
  padding: '0.5rem 1.25rem', borderRadius: 8, border: '1px solid #4a5a74',
  background: '#1c2636', color: '#dbe4f0', cursor: 'pointer',
} as const;
