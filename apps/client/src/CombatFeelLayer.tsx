import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import './CombatFeelLayer.css';
import type { GameClientState } from './gameTypes';
import { emitCombatImpact, subscribeCombatImpacts, type CombatImpactKind } from './combatFeel';
import { dangerHeartbeatMs, dangerLevel, dangerOpacity, screenAngleFromWorldDirection } from './combatFeelScreen';

/**
 * Screen-space combat feel: the low-health danger vignette, the directional
 * impact flash, and the level-up payoff beat.
 *
 * Rendered between the world and the HUD in App, with no z-index of its own —
 * every positioned HUD sibling after it paints on top, so the layer can never
 * cover a panel — and `pointer-events: none`, so it can never eat a click on
 * the mob under the cursor. See CombatFeelLayer.css.
 */

/** Long enough to read as a flash, short enough that a second hit re-triggers cleanly. */
const FLASH_LIFETIME_MS = 420;
/** Matches the payoff keyframes; the element unmounts as the animation ends. */
const PAYOFF_LIFETIME_MS = 1500;

/**
 * Which impacts earn a screen flash, and what it looks like. Landing an
 * ordinary hit does not — it happens constantly, and a screen that flashes on
 * every swing stops meaning anything. Alphas stay low: this is a tint at the
 * edge of vision, not a filter over the fight.
 */
const FLASH_STYLES: Partial<Record<CombatImpactKind, { color: string; bloom: boolean }>> = {
  incoming: { color: 'rgba(220, 38, 38, 0.55)', bloom: false },
  crit: { color: 'rgba(251, 191, 36, 0.32)', bloom: true },
  kill: { color: 'rgba(255, 251, 232, 0.4)', bloom: true },
};

type ScreenFlash = { key: number; angle: number; color: string; bloom: boolean };
type Payoff = { key: number; title: string; sub: string };

export function CombatFeelLayer({ state, cameraAngleRef }: {
  state: GameClientState;
  cameraAngleRef?: MutableRefObject<number>;
}) {
  const me = state.myPlayerId ? state.players[state.myPlayerId] ?? null : null;
  const danger = dangerLevel(me?.health, me?.maxHealth, me?.isAlive);
  const heartbeatMs = dangerHeartbeatMs(danger);
  const flash = useImpactFlash(cameraAngleRef);
  const payoff = useLevelUpPayoff(me?.level);

  return (
    // Decorative by construction: the vitals bar already states the health this
    // is dramatising, so a screen reader gets nothing new from a second channel.
    <div className="combat-feel" aria-hidden="true">
      <div
        className={`combat-feel__veil combat-feel__danger${heartbeatMs === null ? '' : ' combat-feel__danger--critical'}`}
        style={{ opacity: dangerOpacity(danger), animationDuration: heartbeatMs === null ? undefined : `${heartbeatMs}ms` }}
      />
      {flash && (
        <div
          key={flash.key}
          className={`combat-feel__veil combat-feel__flash${flash.bloom ? ' combat-feel__flash--bloom' : ''}`}
          style={{ '--flash-angle': `${flash.angle}deg`, '--flash-color': flash.color } as CSSProperties}
        />
      )}
      {payoff && (
        <div key={payoff.key} className="combat-feel__payoff">
          <span className="combat-feel__payoff-title">{payoff.title}</span>
          <span className="combat-feel__payoff-sub">{payoff.sub}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Turn bus impacts into one short screen flash. The element is keyed on the
 * impact's timestamp so a fresh hit remounts it and the CSS animation restarts
 * from zero instead of continuing a half-faded one.
 */
function useImpactFlash(cameraAngleRef?: MutableRefObject<number>): ScreenFlash | null {
  const [flash, setFlash] = useState<ScreenFlash | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const stop = subscribeCombatImpacts((impact) => {
      const style = FLASH_STYLES[impact.kind];
      if (!style) return;
      // Incoming blows flash the edge they came from; a crit or a kill blooms
      // from the centre, where the thing you just hit is.
      const angle = style.bloom ? 0 : screenAngleFromWorldDirection(impact.dirX, impact.dirZ, cameraAngleRef?.current ?? 0);
      setFlash({ key: impact.at, angle, color: style.color, bloom: style.bloom });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFlash(null), FLASH_LIFETIME_MS);
    });
    return () => {
      stop();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [cameraAngleRef]);
  return flash;
}

/**
 * The level-up beat. Fires on the level the server reports going up — never on
 * the first value we see, so logging in at level 12 doesn't congratulate you
 * for it. Also pushes a `levelUp` impact so the camera swells with the banner.
 */
function useLevelUpPayoff(level: number | undefined): Payoff | null {
  const [payoff, setPayoff] = useState<Payoff | null>(null);
  const previousRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (level === undefined) return;
    const previous = previousRef.current;
    previousRef.current = level;
    if (previous === null || level <= previous) return;
    emitCombatImpact({ kind: 'levelUp', severity: 1, dirX: 0, dirZ: 0 });
    setPayoff({ key: Date.now(), title: `LEVEL ${level}`, sub: 'YOU GREW STRONGER' });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPayoff(null), PAYOFF_LIFETIME_MS);
  }, [level]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return payoff;
}
