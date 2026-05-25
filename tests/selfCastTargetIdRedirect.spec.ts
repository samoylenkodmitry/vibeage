import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import type { Cast } from '../server/combat/skillSystem';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

/**
 * User: "self buffs - i don't see them applied to myself and enemy
 * got selected when i cast them."
 *
 * Root cause: client `resolveCastTargetId` redirects a beneficial
 * skill aimed at an enemy to `player.id` so the cast self-routes.
 * The server's `getTargetsInArea`, however, had a `!== casterId`
 * guard in its PvP-player lookup that filtered the caster out.
 * Result: the buff had no target and was silently dropped.
 *
 * Pinning the impact path so the regression can't return.
 */
function makePlayer(id: string): PlayerState {
  return {
    id, socketId: 's', name: id,
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 50, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'warrior', unlockedSkills: ['rage'],
    availableSkillPoints: 0, skillCooldownEndTs: {}, statusEffects: [],
    level: 20, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true, maxInventorySlots: 20,
  } as unknown as PlayerState;
}

describe('self-cast with targetId === casterId', () => {
  it('applies a beneficial buff to the caster (was silently dropped pre-fix)', () => {
    const player = makePlayer('p1');
    const cast = {
      castId: 'c1', skillId: 'rage', casterId: 'p1',
      targetId: 'p1',
      origin: { x: 0, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 },
      state: 2, startedAt: 0, completesAt: 0, impactAt: 0,
    } as unknown as Cast;
    const events: OutboundEvent[] = [];
    const outbound: OutboundEventSink = { publish: vi.fn((e) => events.push(e)) };
    const world = {
      getEnemyById: vi.fn(() => null),
      getPlayerById: vi.fn((id: string) => (id === 'p1' ? player : null)),
      getEntitiesInCircle: vi.fn(() => []),
      onTargetDied: vi.fn(),
    };

    resolveCastImpact(cast, outbound, world as never);

    // emitServerMessage wraps the payload as { type: 'serverMessage', message }
    const combatLog = events.find(
      (e): e is OutboundEvent & { type: 'serverMessage'; message: { type: 'CombatLog'; targets: string[] } } =>
        e.type === 'serverMessage' && (e as { message?: { type?: string } }).message?.type === 'CombatLog',
    );
    expect(combatLog, 'no CombatLog envelope emitted').toBeDefined();
    expect(combatLog!.message.targets).toEqual(['p1']);
  });
});
