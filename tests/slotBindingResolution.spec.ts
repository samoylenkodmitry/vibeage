import { describe, expect, it } from 'vitest';
import { resolveSlotBinding } from '../apps/client/src/skillShortcuts';
import type { PlayerEntity } from '../apps/client/src/gameTypes';
import type { SkillId } from '../packages/content/skills';

/**
 * User: "i put heal potions here but they don't work on hotkeys,
 * only when i mouse click."
 *
 * Pre-fix the resolver fell back to `unlockedSkills[slotIndex]`
 * unconditionally, so binding a potion to a slot that lined up
 * with an unlocked skill silently lost the binding to the
 * fallback. These tests pin the precedence:
 *   explicit skill > item shortcut > fallback skill.
 *
 * Both the skill bar render and the hotkey handler call this
 * single function — if one branch ever forgets to honour an item
 * binding, every test below fails.
 */
function makePlayer(opts: { shortcuts?: (SkillId | null)[]; unlocked?: SkillId[] } = {}): PlayerEntity {
  return {
    id: 'p', name: 'p',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    isAlive: true, level: 1, experience: 0, experienceToNextLevel: 100,
    skillCooldownEndTs: {}, statusEffects: [],
    className: 'mage', race: 'human',
    unlockedSkills: opts.unlocked ?? [],
    skillShortcuts: opts.shortcuts ?? [],
    availableSkillPoints: 0,
  } as unknown as PlayerEntity;
}

describe('resolveSlotBinding — single source of truth for skill bar slots', () => {
  it('returns the explicit skill shortcut when set', () => {
    const player = makePlayer({ shortcuts: ['fireball' as SkillId] });
    const out = resolveSlotBinding(player, [null], 0);
    expect(out).toEqual({ kind: 'skill', id: 'fireball' });
  });

  it('returns the item binding when explicit skill shortcut is empty (even if a fallback skill exists)', () => {
    const player = makePlayer({ shortcuts: [], unlocked: ['fireball' as SkillId, 'slash' as SkillId] });
    const out = resolveSlotBinding(player, ['health_potion'], 0);
    expect(out).toEqual({ kind: 'item', id: 'health_potion' });
  });

  it('returns the fallback skill when neither explicit shortcut nor item binding is present', () => {
    const player = makePlayer({ shortcuts: [], unlocked: ['fireball' as SkillId] });
    const out = resolveSlotBinding(player, [null], 0);
    expect(out).toEqual({ kind: 'skill', id: 'fireball' });
  });

  it('returns null when nothing is bound', () => {
    const player = makePlayer({ shortcuts: [], unlocked: [] });
    const out = resolveSlotBinding(player, [null], 0);
    expect(out).toBeNull();
  });

  it('explicit shortcut beats both item and fallback', () => {
    const player = makePlayer({ shortcuts: ['slash' as SkillId], unlocked: ['fireball' as SkillId] });
    const out = resolveSlotBinding(player, ['health_potion'], 0);
    expect(out).toEqual({ kind: 'skill', id: 'slash' });
  });
});
