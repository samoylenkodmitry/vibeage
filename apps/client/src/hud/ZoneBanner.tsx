import { useEffect, useMemo, useRef, useState } from 'react';
import { ZoneManager } from '../../../../packages/content/zones';
import type { PlayerEntity } from '../gameTypes';

type ZoneBannerProps = {
  player: PlayerEntity | null;
};

const BANNER_DURATION_MS = 2600;
const SAMPLE_THROTTLE_MS = 400;

/**
 * Brief "Welcome to <Zone>" banner when the player crosses into a
 * different named GAME_ZONES region. Computes the current zone
 * client-side via the shared ZoneManager (same predicate the server
 * uses to assign players to zones, so a crossing here matches the
 * server's view). First sample after mount is treated as baseline
 * so reconnects don't spam the banner.
 */
type Difficulty = 'low' | 'fair' | 'high';

type Banner = {
  key: number;
  name: string;
  minLevel: number;
  maxLevel: number;
  difficulty: Difficulty;
};

function difficultyFor(playerLevel: number, minLevel: number, maxLevel: number): Difficulty {
  if (playerLevel < minLevel) return 'high';
  if (playerLevel > maxLevel) return 'low';
  return 'fair';
}

export function ZoneBanner({ player }: ZoneBannerProps) {
  const zoneManager = useMemo(() => new ZoneManager(), []);
  const lastZoneIdRef = useRef<string | null>(null);
  const lastSampleAtRef = useRef(0);
  const initializedRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!player) return;
    const now = performance.now();
    if (now - lastSampleAtRef.current < SAMPLE_THROTTLE_MS) return;
    lastSampleAtRef.current = now;

    const zone = zoneManager.getZoneAtPosition(player.position);
    const id = zone?.id ?? null;
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastZoneIdRef.current = id;
      return;
    }
    if (id === lastZoneIdRef.current) return;
    lastZoneIdRef.current = id;
    if (!zone) return;

    // Replace any in-flight timer so frequent crossings restart the
    // fade instead of letting a stale callback clear the newest
    // banner mid-flight. Re-running this effect on every player
    // update would otherwise eat the timeout immediately.
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    seqRef.current += 1;
    setBanner({
      key: seqRef.current,
      name: zone.name,
      minLevel: zone.minLevel,
      maxLevel: zone.maxLevel,
      difficulty: difficultyFor(player.level, zone.minLevel, zone.maxLevel),
    });
    timeoutRef.current = window.setTimeout(() => {
      setBanner(null);
      timeoutRef.current = null;
    }, BANNER_DURATION_MS);
  }, [player, zoneManager]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  if (!banner) return null;
  const levelText = banner.minLevel === banner.maxLevel
    ? `Lv ${banner.minLevel}`
    : `Lv ${banner.minLevel}–${banner.maxLevel}`;
  return (
    <div
      className={`zone-banner zone-banner--difficulty-${banner.difficulty}`}
      key={banner.key}
      aria-live="polite"
    >
      <span className="zone-banner__eyebrow">You enter</span>
      <strong className="zone-banner__name">{banner.name}</strong>
      <span className="zone-banner__level">{levelText}</span>
    </div>
  );
}
