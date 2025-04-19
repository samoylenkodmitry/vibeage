"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GAME_ZONES = exports.ZoneManager = void 0;
class ZoneManager {
    getZoneAtPosition(position) {
        for (const zone of exports.GAME_ZONES) {
            const dx = position.x - zone.position.x;
            const dz = position.z - zone.position.z;
            const distanceSquared = dx * dx + dz * dz;
            if (distanceSquared <= zone.radius * zone.radius) {
                return zone;
            }
        }
        return null;
    }
    getMobsToSpawn(zoneId) {
        const zone = exports.GAME_ZONES.find(z => z.id === zoneId);
        if (!zone)
            return [];
        return zone.mobs.map(mobConfig => {
            const count = Math.floor(Math.random() * (mobConfig.maxCount - mobConfig.minCount + 1) +
                mobConfig.minCount);
            return {
                type: mobConfig.type,
                count
            };
        });
    }
    getRandomPositionInZone(zoneId) {
        const zone = exports.GAME_ZONES.find(z => z.id === zoneId);
        if (!zone)
            return null;
        // Get a random angle and distance within the zone's radius
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * zone.radius;
        return {
            x: zone.position.x + Math.cos(angle) * distance,
            y: 0.5, // Slightly above ground
            z: zone.position.z + Math.sin(angle) * distance
        };
    }
    getMobLevel(zoneId) {
        const zone = exports.GAME_ZONES.find(z => z.id === zoneId);
        if (!zone)
            return 1;
        return Math.floor(Math.random() * (zone.maxLevel - zone.minLevel + 1) +
            zone.minLevel);
    }
}
exports.ZoneManager = ZoneManager;
exports.GAME_ZONES = [
    {
        id: 'starter_meadow',
        name: 'Peaceful Meadows',
        description: 'A tranquil starting area with gentle slopes and scattered trees',
        position: { x: 0, y: 0, z: 0 },
        radius: 100,
        minLevel: 1,
        maxLevel: 3,
        mobs: [
            { type: 'goblin', weight: 70, minCount: 5, maxCount: 8 },
            { type: 'wolf', weight: 30, minCount: 2, maxCount: 4 }
        ]
    },
    {
        id: 'dark_forest',
        name: 'Dark Forest',
        description: 'A dense forest with challenging enemies',
        position: { x: 200, y: 0, z: 200 },
        radius: 150,
        minLevel: 3,
        maxLevel: 5,
        mobs: [
            { type: 'wolf', weight: 40, minCount: 4, maxCount: 8 },
            { type: 'skeleton', weight: 60, minCount: 3, maxCount: 6 }
        ]
    }
];
