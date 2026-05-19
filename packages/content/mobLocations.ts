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
    // PR FF — emit one pin per authored spawn anchor. When this mob
    // type is both a regular spawn AND the zone's mini-boss (e.g.
    // goblins + Grakk in starter_meadow), show *both* the boss lair
    // and the camp; the wiki shouldn't hide one behind the other.
    // Boss pin first so it stays the headline location.
    if (zone.miniBoss?.type === mobType) {
      out.push({
        zone,
        position: zone.miniBoss.position ? { ...zone.miniBoss.position } : { ...zone.position },
      });
    }
    const zoneMob = zone.mobs.find((m) => m.type === mobType);
    if (zoneMob) {
      out.push({
        zone,
        position: zoneMob.position ? { ...zoneMob.position } : { ...zone.position },
      });
    }
  }
  return out;
}

export function listMobTemplates(): EnemyTemplate[] {
  // Walking ENEMY_TEMPLATES.values keeps the catalog content-driven —
  // adding a new template in enemies.ts shows it in the Wiki Mobs tab.
  return Object.values(ENEMY_TEMPLATES);
}
