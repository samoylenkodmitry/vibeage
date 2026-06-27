import { describe, expect, it, vi } from 'vitest';
import { createTransientPlayer } from '../server/playerFactory';
import { applyBecomeIdentity } from '../server/players/playerIdentity';
import type { OutboundEventSink } from '../server/transport/outboundEvents';

// Become carry-forward: stamping a chosen identity onto the live guest grants
// the class kit and broadcasts the change, while the trial's progress
// (level/xp/gold/inventory) rides along untouched into the saved hero.

function sink(): OutboundEventSink & { publish: ReturnType<typeof vi.fn> } {
  return { publish: vi.fn() } as unknown as OutboundEventSink & { publish: ReturnType<typeof vi.fn> };
}

describe('applyBecomeIdentity', () => {
  it('stamps race/class/name + grants the class kit, carrying progress untouched', () => {
    const guest = createTransientPlayer('sock', 'Nameless', { guest: true });
    // A few minutes of trial progress as the Nameless.
    guest.level = 5;
    guest.experience = 1234;
    guest.gold = 99;

    const out = sink();
    const result = applyBecomeIdentity(guest, 'elf', 'ranger', 'Arinthel', out);

    expect(result.ok).toBe(true);
    expect(guest.name).toBe('Arinthel');
    expect(guest.race).toBe('elf');
    expect(guest.className).toBe('ranger');
    // Gained the ranger starter kit — no longer just the universal attack.
    expect(guest.unlockedSkills).not.toEqual(['basicAttack', 'escape']);
    expect(guest.unlockedSkills).toContain('basicAttack');
    // Carried progress is untouched.
    expect(guest.level).toBe(5);
    expect(guest.experience).toBe(1234);
    expect(guest.gold).toBe(99);
    // Broadcasts the identity change to the client.
    expect(out.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'playerUpdated',
      update: expect.objectContaining({ name: 'Arinthel', race: 'elf', className: 'ranger' }),
    }));
  });

  it('a human still gets the full mage kit (unconditional — even at the guest default)', () => {
    const guest = createTransientPlayer('sock2', 'Nameless', { guest: true });
    const result = applyBecomeIdentity(guest, 'human', 'mage', 'Mardul', sink());
    expect(result.ok).toBe(true);
    expect(guest.className).toBe('mage');
    // The guest's hidden default was human/mage with universal skills only;
    // Become must still grant the mage starter (fireball), not leave it bare.
    expect(guest.unlockedSkills).toContain('fireball');
  });

  it('rejects an illegal race/prophecy combination', () => {
    const guest = createTransientPlayer('sock3', 'Nameless', { guest: true });
    const result = applyBecomeIdentity(guest, 'orc', 'mage', 'Grok', sink());
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('invalidIdentity');
  });
});
