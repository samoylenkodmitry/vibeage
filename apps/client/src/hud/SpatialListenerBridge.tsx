import { useEffect, useRef, type MutableRefObject } from 'react';
import type { PlayerEntity } from '../gameTypes';
import { setSpatialListener } from '../audio/spatial';

/**
 * Feeds the spatial-audio listener the player's world position + camera yaw at
 * ~12Hz so positional SFX pan/attenuate correctly. The camera angle lives in a
 * ref the camera rig mutates without re-rendering, so we poll rather than react.
 * Headless.
 */
export function SpatialListenerBridge({
  player,
  cameraAngleRef,
}: {
  player: PlayerEntity | null;
  cameraAngleRef?: MutableRefObject<number>;
}) {
  const playerRef = useRef<PlayerEntity | null>(player);
  playerRef.current = player;

  useEffect(() => {
    const id = setInterval(() => {
      const p = playerRef.current;
      if (p) setSpatialListener(p.position.x, p.position.z, cameraAngleRef?.current ?? 0);
    }, 80);
    return () => clearInterval(id);
  }, [cameraAngleRef]);

  return null;
}
