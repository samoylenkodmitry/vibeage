import { useEffect, useMemo, useState } from 'react';
import { ZoneManager } from '../../../../packages/content/zones';
import { zoneIconPath } from '../../../../packages/content/zoneIcons';
import type { PlayerEntity } from '../gameTypes';
import { difficultyFor, type ZoneDifficulty } from './ZoneBanner';

type CurrentZoneChipProps = {
  player: PlayerEntity | null;
};

const SAMPLE_INTERVAL_MS = 500;

/**
 * Always-on chip showing the player's current zone + a difficulty
 * tint vs their level. Companion to [[ZoneBanner]]: the banner
 * fires on crossing, this chip stays visible for "where am I,
 * and is this fight fair?" at-a-glance.
 *
 * Polls the player position on a 0.5s tick — cheap because
 * computeZone is just N circle-bounds checks (currently 10 zones).
 * Skips rendering when the player is between zones (e.g. world
 * boundary) so it doesn't render a confusing blank.
 */
export function CurrentZoneChip({ player }: CurrentZoneChipProps) {
  const zoneManager = useMemo(() => new ZoneManager(), []);
  const [zoneId, setZoneId] = useState<string | null>(null);

  useEffect(() => {
    if (!player) {
      setZoneId(null);
      return;
    }
    const sample = () => {
      const zone = zoneManager.getZoneAtPosition(player.position);
      setZoneId(zone?.id ?? null);
    };
    sample();
    const id = window.setInterval(sample, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [player, zoneManager]);

  if (!player || !zoneId) return null;
  const zone = zoneManager.getZoneById(zoneId);
  if (!zone) return null;
  const difficulty: ZoneDifficulty = difficultyFor(player.level, zone.minLevel, zone.maxLevel);
  const levelText = zone.minLevel === zone.maxLevel
    ? `Lv ${zone.minLevel}`
    : `Lv ${zone.minLevel}–${zone.maxLevel}`;

  return (
    <span
      className={`current-zone-chip current-zone-chip--difficulty-${difficulty}`}
      data-testid="current-zone-chip"
      data-difficulty={difficulty}
      title={`${zone.name} (recommended ${levelText})`}
    >
      <img className="current-zone-chip__thumb" src={zoneIconPath(zoneId)} alt="" aria-hidden="true" />
      <span className="current-zone-chip__name">{zone.name}</span>
      <span className="current-zone-chip__level">{levelText}</span>
    </span>
  );
}
