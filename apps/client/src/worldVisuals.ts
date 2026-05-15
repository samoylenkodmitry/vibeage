import { getEnemyTemplate, type EnemyVisualSpec } from '../../../packages/content/enemies';
import { GAME_ZONES, type Zone } from '../../../packages/content/zones';

export type EnemyVisual = EnemyVisualSpec;

export type ZoneLandmarkVisual = {
  id: string;
  position: { x: number; z: number };
  radius: number;
  ringColor: string;
  accentColor: string;
  height: number;
  beaconRadius: number;
  showBeacon: boolean;
};

const ZONE_PALETTE = [
  { ringColor: '#5eead4', accentColor: '#14b8a6' },
  { ringColor: '#86efac', accentColor: '#22c55e' },
  { ringColor: '#fbbf24', accentColor: '#d97706' },
  { ringColor: '#93c5fd', accentColor: '#2563eb' },
  { ringColor: '#fca5a5', accentColor: '#dc2626' },
  { ringColor: '#c4b5fd', accentColor: '#7c3aed' },
  { ringColor: '#f9a8d4', accentColor: '#db2777' },
  { ringColor: '#a7f3d0', accentColor: '#059669' },
] as const;

export function getEnemyVisual(type: string): EnemyVisual {
  return getEnemyTemplate(type).visual;
}

export function getZoneLandmarks(zones: Zone[] = GAME_ZONES): ZoneLandmarkVisual[] {
  return zones.map(toZoneLandmarkVisual);
}

function toZoneLandmarkVisual(zone: Zone, index: number): ZoneLandmarkVisual {
  const palette = ZONE_PALETTE[index % ZONE_PALETTE.length];
  const tier = Math.max(1, Math.ceil(zone.maxLevel / 5));
  const isStarterZone = zone.id === 'starter_meadow';

  return {
    id: zone.id,
    position: { x: zone.position.x, z: zone.position.z },
    radius: zone.radius,
    ringColor: palette.ringColor,
    accentColor: palette.accentColor,
    height: isStarterZone ? 0.6 : 2.2 + tier * 0.42,
    beaconRadius: isStarterZone ? 1.1 : clamp(zone.radius * 0.024, 2.2, 5.2),
    showBeacon: !isStarterZone,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
