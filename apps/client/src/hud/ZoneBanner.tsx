import { useEffect, useRef, useState } from 'react';
import { GAME_ZONES, type Zone } from '../../../../packages/content/zones';
import type { PlayerEntity } from '../gameTypes';

type ZoneBannerProps = {
  player: PlayerEntity | null;
};

const BANNER_DURATION_MS = 2600;
const SAMPLE_THROTTLE_MS = 400;

function pickZoneAt(x: number, z: number): Zone | null {
  for (const zone of GAME_ZONES) {
    const dx = x - zone.position.x;
    const dz = z - zone.position.z;
    if (dx * dx + dz * dz <= zone.radius * zone.radius) return zone;
  }
  return null;
}

/**
 * Brief "Welcome to <Zone>" banner when the player crosses into a
 * different named GAME_ZONES region. Computes the current zone
 * client-side from player position (no server plumbing). The first
 * zone after spawn doesn't trigger — we treat the initial sample as
 * baseline so reconnects don't spam the banner.
 */
export function ZoneBanner({ player }: ZoneBannerProps) {
  const lastZoneIdRef = useRef<string | null>(null);
  const lastSampleAtRef = useRef(0);
  const initializedRef = useRef(false);
  const [banner, setBanner] = useState<{ key: number; name: string } | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!player) return;
    const now = performance.now();
    if (now - lastSampleAtRef.current < SAMPLE_THROTTLE_MS) return;
    lastSampleAtRef.current = now;

    const zone = pickZoneAt(player.position.x, player.position.z);
    const id = zone?.id ?? null;
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastZoneIdRef.current = id;
      return;
    }
    if (id === lastZoneIdRef.current) return;
    lastZoneIdRef.current = id;
    if (!zone) return;

    seqRef.current += 1;
    setBanner({ key: seqRef.current, name: zone.name });
    const t = window.setTimeout(() => setBanner(null), BANNER_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [player]);

  if (!banner) return null;
  return (
    <div className="zone-banner" key={banner.key} aria-live="polite">
      <span className="zone-banner__eyebrow">You enter</span>
      <strong className="zone-banner__name">{banner.name}</strong>
    </div>
  );
}
