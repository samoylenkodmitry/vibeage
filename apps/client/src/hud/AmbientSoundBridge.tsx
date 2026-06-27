import { useEffect } from 'react';
import { computeDayPhase, nightFactorFromSunDir } from '../timeOfDay';
import { setSoundscapeNightFactor, startSoundscape, stopSoundscape } from '../audio/soundscape';

/**
 * Drives the procedural ambient soundscape. Headless:
 *  - starts it on the first user gesture (a browser AudioContext can only begin
 *    after one — starting on mount would just warn and stay suspended), and
 *  - feeds it the live day/night factor each second (same source the visible
 *    sky uses) so crickets fade in at dusk and birds chirp by day.
 */
export function AmbientSoundBridge() {
  useEffect(() => {
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      startSoundscape();
      window.removeEventListener('pointerdown', start, { capture: true });
      window.removeEventListener('keydown', start, { capture: true });
    };
    window.addEventListener('pointerdown', start, { capture: true });
    window.addEventListener('keydown', start, { capture: true });

    const tick = () => setSoundscapeNightFactor(nightFactorFromSunDir(computeDayPhase(Date.now()).sunDir.y));
    tick();
    const interval = setInterval(tick, 1000);

    return () => {
      window.removeEventListener('pointerdown', start, { capture: true });
      window.removeEventListener('keydown', start, { capture: true });
      clearInterval(interval);
      stopSoundscape();
    };
  }, []);
  return null;
}
