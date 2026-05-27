import { describe, expect, it } from 'vitest';
import { hydratePersistedPlayer } from '../server/players/playerSession';

describe('hydratePersistedPlayer backfills the class starter skill', () => {
  it('unlocks slash for a saved warrior with only fireball (legacy pre-slice-20 record)', () => {
    const player = hydratePersistedPlayer(
      {
        id: 'legacy-warrior',
        class_name: 'warrior',
        race: 'orc',
        skills: ['fireball'],
        available_skill_points: 0,
        level: 5,
        experience: 0,
        health: 100,
        is_alive: true,
        position_x: 0,
        position_y: 0.5,
        position_z: 0,
        starter_progress: undefined,
      },
      'socket1',
      'LegacyWarrior',
      Date.now(),
    );

    expect(player.className).toBe('warrior');
    expect(player.unlockedSkills).toContain('slash');
  });

  it('unlocks evade for a saved rogue with no rogue skill (legacy record)', () => {
    const player = hydratePersistedPlayer(
      {
        id: 'legacy-rogue',
        class_name: 'rogue',
        race: 'dark_elf',
        skills: ['fireball'],
        available_skill_points: 0,
        level: 5,
        experience: 0,
        health: 100,
        is_alive: true,
        position_x: 0,
        position_y: 0.5,
        position_z: 0,
        starter_progress: undefined,
      },
      'socket2',
      'LegacyRogue',
      Date.now(),
    );

    expect(player.unlockedSkills).toContain('evade');
  });

});

describe('hydratePersistedPlayer drops wrong-class skills', () => {
  it('drops cross-class skills carried over from a previous class (legacy record cleanup)', () => {
    // Legacy warrior persisted with mage skills (pre-slice-131 class
    // change could leak ['fireball','slash']). Hydrate must drop the
    // ones that don't belong to the saved class's tree.
    const player = hydratePersistedPlayer(
      {
        id: 'legacy-warrior-with-mage-skills',
        class_name: 'warrior',
        race: 'orc',
        skills: ['fireball', 'waterSplash'],
        available_skill_points: 0,
        level: 5,
        experience: 0,
        health: 100,
        is_alive: true,
        position_x: 0,
        position_y: 0.5,
        position_z: 0,
        starter_progress: undefined,
      },
      'socketWX',
      'CrossClassWarrior',
      Date.now(),
    );

    // waterSplash is NOT in warrior's tree. fireball IS (level 6).
    // After backfill: only warrior-tree skills survive. starter is added.
    expect(player.unlockedSkills).toContain('slash');
    expect(player.unlockedSkills).not.toContain('waterSplash');
  });

  it('does not duplicate the starter if already unlocked', () => {
    const player = hydratePersistedPlayer(
      {
        id: 'warrior-with-slash',
        class_name: 'warrior',
        race: 'orc',
        skills: ['slash', 'bash'],
        available_skill_points: 0,
        level: 5,
        experience: 0,
        health: 100,
        is_alive: true,
        position_x: 0,
        position_y: 0.5,
        position_z: 0,
        starter_progress: undefined,
      },
      'socket3',
      'WarriorWithSlash',
      Date.now(),
    );

    const slashCount = player.unlockedSkills.filter(s => s === 'slash').length;
    expect(slashCount).toBe(1);
  });
});
