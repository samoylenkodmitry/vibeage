import { ENEMY_TEMPLATES, type EnemyTemplate } from './enemies.js';
import { GAME_ZONES, type Zone } from './zones.js';

/**
 * Derive "where does this mob spawn" purely from zone data so the
 * Wiki Mobs tab and the map-pin click can show real positions
 * without a separate static catalog. Adding a new mob to a zone
 * (zones.ts) shows up here automatically — no per-mob code.
 */
export interface MobZoneRef {
  zone: Zone;
  /** Approximate marker position = zone center. */
  position: { x: number; y: number; z: number };
}

export function getMobZones(mobType: string): MobZoneRef[] {
  const out: MobZoneRef[] = [];
  for (const zone of GAME_ZONES) {
    const inMobs = zone.mobs.some((m) => m.type === mobType);
    const isMiniBoss = zone.miniBoss?.type === mobType;
    if (inMobs || isMiniBoss) {
      out.push({ zone, position: { ...zone.position } });
    }
  }
  return out;
}

export function listMobTemplates(): EnemyTemplate[] {
  // Walking ENEMY_TEMPLATES.values keeps the catalog content-driven —
  // adding a new template in enemies.ts shows it in the Wiki Mobs tab.
  return Object.values(ENEMY_TEMPLATES);
}
