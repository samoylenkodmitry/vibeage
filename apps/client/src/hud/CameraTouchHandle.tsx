import { useEffect, useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import type { CameraControls } from '../CameraRig';

type CameraTouchHandleProps = {
  cameraControlsRef: MutableRefObject<CameraControls | null>;
};

export function CameraTouchHandle({ cameraControlsRef }: CameraTouchHandleProps) {
  const lastRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const elementRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const query = window.matchMedia('(hover: none) and (pointer: coarse)');
    const apply = () => {
      const el = elementRef.current;
      if (el) {
        el.style.display = query.matches ? '' : 'none';
      }
    };
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    lastRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const last = lastRef.current;
    if (!last || last.pointerId !== event.pointerId) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    last.x = event.clientX;
    last.y = event.clientY;
    cameraControlsRef.current?.applyDelta({ x: dx, y: dy });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (lastRef.current?.pointerId === event.pointerId) {
      lastRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // already released
      }
    }
  };

  return (
    <button
      ref={elementRef}
      type="button"
      className="camera-touch-handle"
      aria-label="Rotate camera (drag to look around)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span aria-hidden="true">↻ Look</span>
    </button>
  );
}
