import { describe, expect, it } from 'vitest';
import { createTransientPlayer } from '../server/playerFactory';
import { QUEST_NPCS } from '../packages/content/npcs';

// §49/M2 — fresh players spawn facing Warden Galen so a new
// player sees the starter quest-giver immediately instead of
// staring at a random horizon. Yaw is computed from Galen's
// authored position; if he moves, the yaw follows.

describe('createTransientPlayer faces Warden Galen on spawn', () => {
  it('rotation.y points toward Galen from the spawn coord', () => {
    const player = createTransientPlayer('spawn-1', 'NewbieMage');
    const galen = QUEST_NPCS.warden_galen;
    const dx = galen.position.x - player.position.x;
    const dz = galen.position.z - player.position.z;
    const expectedYaw = Math.atan2(dx, dz);
    expect(player.rotation.y).toBeCloseTo(expectedYaw, 4);
  });

  it('spawn position itself is unchanged at the origin', () => {
    const player = createTransientPlayer('spawn-2', 'NewbieMage');
    expect(player.position).toEqual({ x: 0, y: 0.5, z: 0 });
  });
});
