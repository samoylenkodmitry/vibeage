import { useCallback, useMemo, useState, type ReactNode } from 'react';

/**
 * WebGL availability gate. When the browser's GPU process has died (after
 * repeated context losses, GPU resets, or driver crashes) EVERY context
 * request fails — and mounting the R3F Canvas anyway produced an infinite
 * retry storm (thousands of "Error creating WebGL context" logs) over a
 * blank world while the DOM HUD kept running. Probe once, and if graphics
 * are unavailable render a human explanation with a retry button instead.
 */
function probeWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function WebGLGate({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  // Re-probe on every retry click; the initial probe runs once per mount.
  const available = useMemo(() => probeWebGL(), [attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  if (available) return <>{children}</>;
  return (
    <div
      role="alert"
      style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#10141c', color: '#dbe4f0', textAlign: 'center', padding: '2rem', zIndex: 0,
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h2 style={{ margin: '0 0 0.5rem' }}>Graphics unavailable</h2>
        <p style={{ margin: '0 0 1rem', opacity: 0.85 }}>
          Your browser couldn&apos;t create a 3D graphics context — its GPU process has likely
          crashed. Fully restarting the browser usually fixes this (check chrome://gpu).
          The game world can&apos;t render until then.
        </p>
        <button
          type="button"
          onClick={retry}
          style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: '1px solid #4a5a74', background: '#1c2636', color: '#dbe4f0', cursor: 'pointer' }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
