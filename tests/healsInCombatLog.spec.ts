import { describe, expect, it, vi } from 'vitest';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { CastState, type ServerMessage } from '../packages/protocol/messages';
import { SPECIALIZATION_UNLOCK_LEVEL } from '../packages/content/specializations';
import { recomputePlayerStats } from '../server/players/playerStatsRefresh';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

/**
 * §52 #6 part 2 — heals surface in the combat log.
 *
 * `applyHealEffect` now returns the applied amount (post-maxHealth
 * cap). `applyCastToTarget` propagates it. The two CombatLog emit
 * sites (`applyProjectileHit` + `resolveCastImpact`) build a
 * `heals[]` array parallel to `damages[]`. The client renders
 * "X healed Y for N" for pure-heal casts and "(+N healed)" as a
 * suffix on mixed damage+heal casts.
 *
 * Overheal is intentionally trimmed at the server boundary — the
 * client only ever sees the *visible* delta. This matches the
 * design that the player should see what hit the bar, not the raw
 * server-side roll.
 */

function makeHealer(): PlayerState {
  const player: PlayerState = {
    id: 'healer-1', socketId: 's', name: 'healer',
    position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'healer', unlockedSkills: ['holyLight'],
 availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: SPECIALIZATION_UNLOCK_LEVEL, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
  };
  recomputePlayerStats(player);
  return player;
}

function makeWounded(): PlayerState {
  return {
    id: 'wounded-1', socketId: 's', name: 'wounded',
    position: { x: 1, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 50, maxHealth: 5000, mana: 100, maxMana: 100,
    className: 'warrior', unlockedSkills: [],
 availableSkillPoints: 0,
    skillCooldownEndTs: {}, statusEffects: [],
    level: 5, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0,
    isAlive: true, maxInventorySlots: 20,
  };
}

function holyLightCast(caster: PlayerState, target: PlayerState): Cast {
  return {
    castId: 'c-heal', casterId: caster.id, skillId: 'holyLight',
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: target.position.x, z: target.position.z },
    startedAt: Date.now(), castTimeMs: 0,
    targetId: target.id,
  };
}

function worldFor(caster: PlayerState, target: PlayerState): CombatWorld {
  return {
    getEnemyById: () => null,
    getPlayerById: (id: string) => (id === caster.id ? caster : id === target.id ? target : null),
    getEntitiesInCircle: () => [target],
    onTargetDied: vi.fn(),
  } as unknown as CombatWorld;
}

function captureCombatLogs(events: OutboundEvent[]): Array<ServerMessage & { type: 'CombatLog' }> {
  return events
    .filter((e): e is Extract<OutboundEvent, { type: 'serverMessage' }> => e.type === 'serverMessage')
    .map((e) => e.message)
    .filter((m): m is ServerMessage & { type: 'CombatLog' } => m.type === 'CombatLog');
}

describe('resolveCastImpact — heals[] in CombatLog', () => {
  it('emits a positive heals[] entry when a heal skill restores HP', () => {
    const healer = makeHealer();
    const wounded = makeWounded();
    const events: OutboundEvent[] = [];
    const out: OutboundEventSink = { publish: (e: OutboundEvent) => events.push(e) };

    resolveCastImpact(holyLightCast(healer, wounded), out, worldFor(healer, wounded));

    const logs = captureCombatLogs(events);
    expect(logs).toHaveLength(1);
    expect(logs[0].heals).toBeDefined();
    expect(logs[0].heals![0]).toBeGreaterThan(0);
    // The healed amount in heals[] matches the actual HP gained.
    const actualHpGained = wounded.health - 50;
    expect(logs[0].heals![0]).toBe(Math.round(actualHpGained));
  });

  it('caps the reported heal at the maxHealth gap (overheal stays invisible)', () => {
    const healer = makeHealer();
    // Wounded only needs 1 HP to top off; heal value is much larger.
    const nearlyFull: PlayerState = { ...makeWounded(), health: 4999, maxHealth: 5000 };
    const events: OutboundEvent[] = [];
    const out: OutboundEventSink = { publish: (e: OutboundEvent) => events.push(e) };

    resolveCastImpact(holyLightCast(healer, nearlyFull), out, worldFor(healer, nearlyFull));

    const logs = captureCombatLogs(events);
    expect(logs).toHaveLength(1);
    // Healed exactly 1 HP, not the full skill value.
    expect(logs[0].heals![0]).toBe(1);
    expect(nearlyFull.health).toBe(5000);
  });

  it('reports 0 in heals[] for a fully-overhealed target (already at max)', () => {
    const healer = makeHealer();
    const full: PlayerState = { ...makeWounded(), health: 5000, maxHealth: 5000 };
    const events: OutboundEvent[] = [];
    const out: OutboundEventSink = { publish: (e: OutboundEvent) => events.push(e) };

    resolveCastImpact(holyLightCast(healer, full), out, worldFor(healer, full));

    const logs = captureCombatLogs(events);
    expect(logs[0].heals![0]).toBe(0);
  });

  it('leaves heals[] empty (all zeros) for a damage-only cast — no spurious heal entry', () => {
    // Reuse the heals path for a fireball; the heal effect doesn't
    // run because fireball's effects don't include `heal`.
    const healer = makeHealer();
    const wounded = makeWounded();
    const events: OutboundEvent[] = [];
    const out: OutboundEventSink = { publish: (e: OutboundEvent) => events.push(e) };

    const fireball: Cast = {
      castId: 'c-fb', casterId: healer.id, skillId: 'fireball',
      state: CastState.Impact,
      origin: { x: 0, z: 0 }, pos: { x: 1, z: 0 },
      startedAt: Date.now(), castTimeMs: 0, targetId: wounded.id,
    };
    resolveCastImpact(fireball, out, worldFor(healer, wounded));

    const logs = captureCombatLogs(events);
    expect(logs[0].heals).toEqual([0]);
  });
});
