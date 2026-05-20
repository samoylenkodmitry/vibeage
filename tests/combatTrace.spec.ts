import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CastState } from '../packages/protocol/messages';
import { resolveCastImpact } from '../server/combat/impactResolver';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createTransientPlayer } from '../server/playerFactory';
import {
  disableCombatTraceCapture,
  drainCombatTraces,
  enableCombatTraceCapture,
  expectedTraceFinal,
  isCombatTraceEnabled,
} from '../packages/sim/combatTrace';
import type { Cast } from '../server/combat/skillSystem';
import type { CombatWorld } from '../server/combat/worldContract';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

// §49/M4 PR016 — combat trace object. Dev tool exposes the
// multiplier chain that built the final damage so designers can
// answer "why did this hit do 187 instead of 150?".

function makeWorld(caster: PlayerState, target: ReturnType<typeof createEnemy>): CombatWorld {
  return {
    getEnemyById: (id) => (id === target.id ? target : null),
    getPlayerById: (id) => (id === caster.id ? caster : null),
    getEntitiesInCircle: () => [target],
    onTargetDied: vi.fn(),
  };
}

function fireballAt(caster: PlayerState, targetId: string, castId = 'c-trace'): Cast {
  return {
    castId, casterId: caster.id, skillId: 'fireball',
    state: CastState.Impact,
    origin: { x: caster.position.x, z: caster.position.z },
    pos: { x: caster.position.x, z: caster.position.z },
    startedAt: Date.now(), castTimeMs: 0,
    targetId,
  } as Cast;
}

describe('combat trace capture', () => {
  beforeEach(() => enableCombatTraceCapture());
  afterEach(() => disableCombatTraceCapture());

  it('captures a trace for every damage roll while enabled', () => {
    const caster = createTransientPlayer('caster-socket', 'TracerMage');
    caster.className = 'mage';
    caster.unlockedSkills = ['fireball', 'basicAttack'];
    const target = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, Date.now());
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireballAt(caster, target.id), out, makeWorld(caster, target));

    const traces = drainCombatTraces();
    expect(traces).toHaveLength(1);
    const t = traces[0];
    expect(t.skillId).toBe('fireball');
    expect(t.casterId).toBe(caster.id);
    expect(t.targetId).toBe(target.id);
    expect(t.baseDamage).toBe(150); // SKILLS.fireball.dmg
    expect(t.final).toBeGreaterThan(0);
  });

  it('trace.final matches expectedTraceFinal — multiplier chain is complete', () => {
    const caster = createTransientPlayer('chain-socket', 'ChainMage');
    caster.className = 'mage';
    caster.unlockedSkills = ['fireball', 'basicAttack'];
    const target = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, Date.now());
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireballAt(caster, target.id, 'c-chain'), out, makeWorld(caster, target));
    const [t] = drainCombatTraces();

    expect(t).toBeDefined();
    expect(expectedTraceFinal(t)).toBeCloseTo(t.final, 4);
  });

  it('records nothing when capture is disabled', () => {
    disableCombatTraceCapture();
    expect(isCombatTraceEnabled()).toBe(false);

    const caster = createTransientPlayer('off-socket', 'OffMage');
    caster.className = 'mage';
    caster.unlockedSkills = ['fireball', 'basicAttack'];
    const target = createEnemy('goblin', 1, { x: 5, y: 0, z: 0 }, Date.now());
    const out: OutboundEventSink = { publish: vi.fn() };

    resolveCastImpact(fireballAt(caster, target.id, 'c-off'), out, makeWorld(caster, target));

    expect(drainCombatTraces()).toEqual([]);
  });
});
