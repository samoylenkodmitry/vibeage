import { bench } from 'vitest';
import { SpatialHashGrid } from '../../server/spatial/SpatialHashGrid';

bench('1000 entities, r=12', () => {
  const g = new SpatialHashGrid(6);
  for (let i = 0; i < 1000; i++) {
    g.insert(`E${i}`, { x: Math.random() * 200, z: Math.random() * 200 });
  }
  g.queryCircle({ x: 100, z: 100 }, 12);
});
