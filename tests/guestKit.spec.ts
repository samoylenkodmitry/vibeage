import { describe, expect, it } from 'vitest';
import { createTransientPlayer } from '../server/playerFactory';

// The Nameless guest is deliberately classless — it can fight with a basic
// attack but carries no class kit (no fireball) until it picks a prophecy
// in-world. Regular transient players keep the full starter kit.

describe('createTransientPlayer guest kit', () => {
  it('a guest gets the basic Attack only — no class skills like fireball', () => {
    const guest = createTransientPlayer('sock-guest', 'Nameless', { guest: true });
    expect(guest.unlockedSkills).toContain('basicAttack');
    expect(guest.unlockedSkills).not.toContain('fireball');
    // Nothing beyond the universal kit (basicAttack + escape) leaks in — no
    // class starter, no auto-granted class passive.
    expect(guest.unlockedSkills.every((s) => s === 'basicAttack' || s === 'escape')).toBe(true);
  });

  it('a normal transient player keeps the full class starter kit', () => {
    const player = createTransientPlayer('sock-1', 'Mage');
    expect(player.unlockedSkills).toContain('fireball');
    expect(player.unlockedSkills).toContain('basicAttack');
  });
});
