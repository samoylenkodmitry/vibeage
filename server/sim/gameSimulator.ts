import type { CharacterClass } from '../../packages/content/classes.js';
import {
  classifySkill,
  SKILLS,
  type SkillId,
} from '../../packages/content/skills.js';
import type { CastReq, ServerMessage, VecXZ } from '../../packages/protocol/messages.js';
import { SimClock } from '../../packages/sim/simClock.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import { updateEnemyAI } from '../ai/enemyAI.js';
import { handleCastReq } from '../combat/castHandler.js';
import { tickDamageOverTimeEffects } from '../combat/dotTicker.js';
import { tickCasts } from '../combat/skillSystem.js';
import { createEnemy, type CreateEnemyOptions } from '../enemies/enemyLifecycle.js';
import { createGameState, type GameState } from '../gameState.js';
import { createTransientPlayer } from '../playerFactory.js';
import { handleResourceRegeneration } from '../players/playerLifecycle.js';
import { getExperienceToNextLevel, starterSkillsFor } from '../players/playerProgression.js';
import { recomputePlayerStats } from '../players/playerStatsRefresh.js';
import { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import type { DirectMessageSink, OutboundEvent, OutboundEventSink } from '../transport/outboundEvents.js';
import { advanceAll, getPlayerSpeed } from '../movement/worldMovement.js';
import { createWorldCombatBridge } from '../world/router/castHandlers.js';

const DEFAULT_TICK_MS = 1000 / 30;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_TEAM_PLAYERS = 'players';
const DEFAULT_TEAM_ENEMIES = 'enemies';
const GROUND_Y = 0.5;

const PRIMARY_SKILL_BY_CLASS: Record<CharacterClass, SkillId> = {
  mage: 'fireball',
  warrior: 'slash',
  healer: 'smite',
  ranger: 'arrowShot',
  knight: 'slash',
  paladin: 'smite',
  rogue: 'backstab',
};

export type SimEntity = PlayerState | Enemy;

export type SimulationAction =
  | { type: 'castSkill'; skillId: SkillId; targetId?: string; targetPos?: VecXZ; force?: boolean }
  | { type: 'moveTo'; targetPos: VecXZ; speed?: number }
  | { type: 'stopMoving' }
  | { type: 'setTarget'; targetId: string | null };

export type PlayerAiContext = {
  state: GameState;
  player: PlayerState;
  now: number;
  deltaMs: number;
  teamId: string;
  hostiles: SimEntity[];
  allies: PlayerState[];
  distanceTo(entity: SimEntity): number;
  teamFor(entityId: string): string | null;
};

export type PlayerAiPolicy = (context: PlayerAiContext) => readonly SimulationAction[];

export type GameSimulatorOptions = {
  tickMs?: number;
  startMs?: number;
};

export type AddPlayerOptions = {
  position?: VecXZ;
  teamId?: string;
  policy?: PlayerAiPolicy;
};

export type AddEnemyOptions = {
  position?: VecXZ;
  teamId?: string;
};

export type SimulatedPlayerOptions = {
  id?: string;
  socketId?: string;
  name?: string;
  className?: CharacterClass;
  level?: number;
  position?: VecXZ;
  unlockedSkills?: SkillId[];
  specializationId?: PlayerState['specializationId'];
  health?: number;
  mana?: number;
};

export type SimulatedEnemyOptions = CreateEnemyOptions & {
  id?: string;
  position?: VecXZ;
  spawnNonceMs?: number;
};

export type RunUntilResult = {
  reason: 'condition' | 'timeout';
  durationMs: number;
  ticks: number;
  summary: SimulationSummary;
};

export type SimulationSummary = {
  now: number;
  durationMs: number;
  winnerTeamId: string | null;
  livingTeamIds: string[];
  teams: Record<string, TeamSummary>;
  players: Record<string, PlayerSimulationSummary>;
  enemies: Record<string, EntitySimulationSummary>;
  damageDoneById: Record<string, number>;
  damageTakenById: Record<string, number>;
  healingDoneById: Record<string, number>;
  castsBySkill: Record<string, number>;
  misses: number;
};

export type TimedOutboundEvent = {
  now: number;
  event: OutboundEvent;
};

export type TeamSummary = {
  initial: number;
  alive: number;
  dead: number;
};

export type EntitySimulationSummary = {
  id: string;
  kind: 'player' | 'enemy';
  teamId: string;
  alive: boolean;
  health: number;
  maxHealth: number;
  level: number;
};

export type PlayerSimulationSummary = EntitySimulationSummary & {
  experience: number;
  experienceToNextLevel: number;
  xpGained: number;
  levelsGained: number;
};

type InitialSnapshot = {
  kind: 'player' | 'enemy';
  teamId: string;
  level: number;
  totalXp: number;
};

export class GameSimulator {
  readonly state: GameState;
  readonly spatial: SpatialHashGrid;
  readonly clock: SimClock;
  readonly events: OutboundEvent[] = [];
  readonly timeline: TimedOutboundEvent[] = [];
  readonly directMessages: ServerMessage[] = [];
  readonly tickMs: number;

  private readonly outbound: OutboundEventSink;
  private readonly direct: DirectMessageSink;
  private readonly initial = new Map<string, InitialSnapshot>();
  private readonly teamByEntityId = new Map<string, string>();
  private readonly playerPolicies = new Map<string, PlayerAiPolicy>();
  private tickCount = 0;
  private readonly startMs: number;

  constructor(options: GameSimulatorOptions = {}) {
    this.tickMs = options.tickMs ?? DEFAULT_TICK_MS;
    this.startMs = options.startMs ?? 0;
    this.clock = new SimClock(this.startMs);
    this.state = createGameState();
    this.spatial = new SpatialHashGrid();
    this.outbound = {
      publish: (event) => {
        this.events.push(event);
        this.timeline.push({ now: this.now(), event });
      },
    };
    this.direct = { send: (message) => this.directMessages.push(message) };
  }

  now(): number {
    return this.clock.now();
  }

  addPlayer(player: PlayerState, options: AddPlayerOptions = {}): PlayerState {
    const position = options.position ?? player.position;
    player.position = { x: position.x, y: player.position.y ?? GROUND_Y, z: position.z };
    this.state.players[player.id] = player;
    this.spatial.insert(player.id, position);
    const teamId = options.teamId ?? DEFAULT_TEAM_PLAYERS;
    this.trackInitial(player, 'player', teamId);
    if (options.policy) this.playerPolicies.set(player.id, options.policy);
    return player;
  }

  addEnemy(enemy: Enemy, options: AddEnemyOptions = {}): Enemy {
    const position = options.position ?? enemy.position;
    enemy.position = { x: position.x, y: enemy.position.y ?? GROUND_Y, z: position.z };
    enemy.spawnPosition = { ...enemy.position };
    this.state.enemies[enemy.id] = enemy;
    this.spatial.insert(enemy.id, position);
    this.trackInitial(enemy, 'enemy', options.teamId ?? DEFAULT_TEAM_ENEMIES);
    return enemy;
  }

  setPlayerPolicy(playerId: string, policy: PlayerAiPolicy | null): void {
    if (policy) this.playerPolicies.set(playerId, policy);
    else this.playerPolicies.delete(playerId);
  }

  teamFor(entityId: string): string | null {
    return this.teamByEntityId.get(entityId) ?? null;
  }

  areHostile(a: string, b: string): boolean {
    const teamA = this.teamFor(a);
    const teamB = this.teamFor(b);
    return Boolean(teamA && teamB && teamA !== teamB);
  }

  movePlayerTo(playerId: string, targetPos: VecXZ, speed?: number): boolean {
    const player = this.state.players[playerId];
    if (!player?.isAlive) return false;
    player.movement = {
      isMoving: true,
      targetPos,
      lastUpdateTime: this.now(),
      speed: speed ?? getPlayerSpeed(player),
    };
    return true;
  }

  stopPlayer(playerId: string): boolean {
    const player = this.state.players[playerId];
    if (!player) return false;
    player.movement = {
      isMoving: false,
      targetPos: null,
      lastUpdateTime: this.now(),
      speed: player.movement?.speed ?? getPlayerSpeed(player),
    };
    player.velocity = { x: 0, z: 0 };
    return true;
  }

  castSkill(playerId: string, skillId: SkillId, targetId?: string, targetPos?: VecXZ, force?: boolean): void {
    const player = this.state.players[playerId];
    if (!player?.isAlive) return;
    handleCastReq(
      { id: player.socketId },
      player,
      makeCastReq(player.id, skillId, this.now(), targetId, targetPos, force),
      { direct: this.direct, outbound: this.outbound },
      createWorldCombatBridge(this.state, this.outbound, this.spatial),
      { activeCasts: this.state.activeCasts, now: this.now() },
    );
  }

  applyPlayerAction(playerId: string, action: SimulationAction): void {
    if (action.type === 'castSkill') {
      this.castSkill(playerId, action.skillId, action.targetId, action.targetPos, action.force);
    } else if (action.type === 'moveTo') {
      this.movePlayerTo(playerId, action.targetPos, action.speed);
    } else if (action.type === 'stopMoving') {
      this.stopPlayer(playerId);
    } else {
      const player = this.state.players[playerId];
      if (player) player.targetId = action.targetId;
    }
  }

  step(deltaMs = this.tickMs): void {
    this.applyPlayerPolicies(deltaMs);
    this.clock.advanceBy(deltaMs);
    const now = this.now();
    advanceAll(this.state, this.spatial, deltaMs, now, this.outbound);
    this.updateAllEnemyAi(deltaMs, now);
    tickCasts(this.state.activeCasts, deltaMs, this.outbound, createWorldCombatBridge(this.state, this.outbound, this.spatial), now);
    tickDamageOverTimeEffects(this.state, this.spatial, this.outbound, now);
    handleResourceRegeneration(this.state, this.outbound, now);
    this.tickCount += 1;
  }

  advance(ms: number): void {
    const end = this.now() + ms;
    while (this.now() < end) {
      this.step(Math.min(this.tickMs, end - this.now()));
    }
  }

  runUntil(
    condition: (sim: GameSimulator) => boolean,
    options: { timeoutMs?: number } = {},
  ): RunUntilResult {
    const startedAt = this.now();
    const startedTicks = this.tickCount;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let satisfied = condition(this);
    while (!satisfied && this.now() - startedAt < timeoutMs) {
      this.step();
      satisfied = condition(this);
    }
    return {
      reason: satisfied ? 'condition' : 'timeout',
      durationMs: this.now() - startedAt,
      ticks: this.tickCount - startedTicks,
      summary: this.summary(),
    };
  }

  isCombatResolved(): boolean {
    return this.winnerTeamId() !== null;
  }

  winnerTeamId(): string | null {
    const livingTeams = this.livingTeamIds();
    if (livingTeams.length !== 1 || this.initialTeamIds().length < 2) return null;
    return livingTeams[0];
  }

  summary(): SimulationSummary {
    const combat = collectCombatMetrics(this.events);
    return {
      now: this.now(),
      durationMs: this.now() - this.startMs,
      winnerTeamId: this.winnerTeamId(),
      livingTeamIds: this.livingTeamIds(),
      teams: this.teamSummary(),
      players: this.playerSummary(),
      enemies: this.enemySummary(),
      ...combat,
    };
  }

  private applyPlayerPolicies(deltaMs: number): void {
    for (const [playerId, policy] of this.playerPolicies) {
      const player = this.state.players[playerId];
      if (!player?.isAlive) continue;
      const context = this.playerAiContext(player, deltaMs);
      for (const action of policy(context)) {
        this.applyPlayerAction(player.id, action);
      }
    }
  }

  private playerAiContext(player: PlayerState, deltaMs: number): PlayerAiContext {
    const entities = livingEntities(this.state);
    return {
      state: this.state,
      player,
      now: this.now(),
      deltaMs,
      teamId: this.teamFor(player.id) ?? DEFAULT_TEAM_PLAYERS,
      hostiles: entities.filter((entity) => this.areHostile(player.id, entity.id)),
      allies: Object.values(this.state.players).filter((ally) => ally.isAlive && !this.areHostile(player.id, ally.id)),
      distanceTo: (entity) => distanceXZ(player.position, entity.position),
      teamFor: (entityId) => this.teamFor(entityId),
    };
  }

  private updateAllEnemyAi(deltaMs: number, now: number): void {
    const world = createWorldCombatBridge(this.state, this.outbound, this.spatial);
    for (const enemy of Object.values(this.state.enemies)) {
      updateEnemyAI(enemy, deltaMs / 1000, {
        state: this.state,
        outbound: this.outbound,
        spatial: this.spatial,
        now,
        world,
        activeCasts: this.state.activeCasts,
      });
    }
  }

  private trackInitial(entity: SimEntity, kind: 'player' | 'enemy', teamId: string): void {
    this.teamByEntityId.set(entity.id, teamId);
    this.initial.set(entity.id, {
      kind,
      teamId,
      level: entity.level,
      totalXp: !isEnemy(entity) ? totalPlayerXp(entity) : 0,
    });
  }

  private livingTeamIds(): string[] {
    return this.initialTeamIds().filter((teamId) => this.livingEntitiesForTeam(teamId) > 0);
  }

  private initialTeamIds(): string[] {
    return [...new Set([...this.initial.values()].map((snapshot) => snapshot.teamId))];
  }

  private livingEntitiesForTeam(teamId: string): number {
    return livingEntities(this.state).filter((entity) => this.teamFor(entity.id) === teamId).length;
  }

  private teamSummary(): Record<string, TeamSummary> {
    const teams: Record<string, TeamSummary> = {};
    for (const snapshot of this.initial.values()) {
      teams[snapshot.teamId] ??= { initial: 0, alive: 0, dead: 0 };
      teams[snapshot.teamId].initial += 1;
    }
    for (const teamId of Object.keys(teams)) {
      teams[teamId].alive = this.livingEntitiesForTeam(teamId);
      teams[teamId].dead = teams[teamId].initial - teams[teamId].alive;
    }
    return teams;
  }

  private playerSummary(): Record<string, PlayerSimulationSummary> {
    const players: Record<string, PlayerSimulationSummary> = {};
    for (const [id, player] of Object.entries(this.state.players)) {
      const initial = this.initial.get(id);
      players[id] = {
        ...entitySummary(player, 'player', this.teamFor(id) ?? DEFAULT_TEAM_PLAYERS),
        experience: player.experience,
        experienceToNextLevel: player.experienceToNextLevel,
        xpGained: totalPlayerXp(player) - (initial?.totalXp ?? 0),
        levelsGained: player.level - (initial?.level ?? player.level),
      };
    }
    return players;
  }

  private enemySummary(): Record<string, EntitySimulationSummary> {
    const enemies: Record<string, EntitySimulationSummary> = {};
    for (const [id, enemy] of Object.entries(this.state.enemies)) {
      enemies[id] = entitySummary(enemy, 'enemy', this.teamFor(id) ?? DEFAULT_TEAM_ENEMIES);
    }
    return enemies;
  }
}

export function createGameSimulator(options: GameSimulatorOptions = {}): GameSimulator {
  return new GameSimulator(options);
}

export function createSimulatedPlayer(options: SimulatedPlayerOptions = {}): PlayerState {
  const className = options.className ?? 'mage';
  const id = options.id ?? `sim-player-${className}-${options.level ?? 1}`;
  const socketId = options.socketId ?? `${id}-socket`;
  const player = createTransientPlayer(socketId, options.name ?? id);
  player.id = id;
  player.socketId = socketId;
  player.className = className;
  player.level = options.level ?? 1;
  player.specializationId = options.specializationId ?? null;
  player.experience = 0;
  player.experienceToNextLevel = getExperienceToNextLevel(player.level);
  player.unlockedSkills = options.unlockedSkills ?? starterSkillsFor(className);
  player.skillCooldownEndTs = {};
  player.statusEffects = [];
  player.castingSkill = null;
  player.castingProgressMs = 0;
  player.isAlive = true;
  player.position = toVec3(options.position ?? { x: 0, z: 0 });
  recomputePlayerStats(player);
  player.health = options.health ?? player.maxHealth;
  player.mana = options.mana ?? player.maxMana;
  return player;
}

export function createSimulatedEnemy(
  type: string,
  level: number,
  options: SimulatedEnemyOptions = {},
): Enemy {
  const position = toVec3(options.position ?? { x: 3, z: 0 });
  const enemy = createEnemy(type, level, position, options.spawnNonceMs ?? 0, options);
  if (options.id) enemy.id = options.id;
  return enemy;
}

export type ClassCombatPolicyOptions = {
  primarySkillId?: SkillId;
  healSkillId?: SkillId;
  healAtHealthFraction?: number;
  desiredRangeFraction?: number;
};

export function createClassCombatPolicy(options: ClassCombatPolicyOptions = {}): PlayerAiPolicy {
  return (context) => {
    if (context.player.castingSkill) return [];
    const healAction = selfHealAction(context, options);
    if (healAction) return [healAction];
    const target = nearestEntity(context.player, context.hostiles);
    if (!target) return [];
    return engageTargetAction(context, target, options);
  };
}

export function createPassivePolicy(): PlayerAiPolicy {
  return () => [];
}

function engageTargetAction(
  context: PlayerAiContext,
  target: SimEntity,
  options: ClassCombatPolicyOptions,
): SimulationAction[] {
  const skillId = selectOffenseSkill(context.player, options.primarySkillId);
  const range = skillRange(skillId);
  const distance = context.distanceTo(target);
  if (distance > range) {
    return [{ type: 'moveTo', targetPos: approachPoint(context.player.position, target.position, range, options.desiredRangeFraction) }];
  }
  const actions: SimulationAction[] = [];
  if (context.player.movement?.isMoving) actions.push({ type: 'stopMoving' });
  actions.push({ type: 'setTarget', targetId: target.id });
  if (canAttemptSkill(context.player, skillId, context.now)) {
    actions.push({ type: 'castSkill', skillId, targetId: target.id, force: !isEnemy(target) });
  }
  return actions;
}

function selfHealAction(
  context: PlayerAiContext,
  options: ClassCombatPolicyOptions,
): SimulationAction | null {
  const skillId = options.healSkillId ?? 'holyLight';
  if (!context.player.unlockedSkills.includes(skillId)) return null;
  const threshold = options.healAtHealthFraction ?? 0.45;
  if (context.player.health / context.player.maxHealth > threshold) return null;
  if (!canAttemptSkill(context.player, skillId, context.now)) return null;
  return { type: 'castSkill', skillId };
}

function selectOffenseSkill(player: PlayerState, preferred?: SkillId): SkillId {
  if (preferred && isUnlockedHarmful(player, preferred) && hasManaForSkill(player, preferred)) return preferred;
  const classPrimary = PRIMARY_SKILL_BY_CLASS[player.className];
  if (isUnlockedHarmful(player, classPrimary) && hasManaForSkill(player, classPrimary)) return classPrimary;
  return player.unlockedSkills.find((skillId) => isUnlockedHarmful(player, skillId) && hasManaForSkill(player, skillId)) ?? 'basicAttack';
}

function isUnlockedHarmful(player: PlayerState, skillId: SkillId): boolean {
  const skill = SKILLS[skillId];
  return Boolean(skill && player.unlockedSkills.includes(skillId) && classifySkill(skill.effects) === 'harmful');
}

function canAttemptSkill(player: PlayerState, skillId: SkillId, now: number): boolean {
  const skill = SKILLS[skillId];
  if (!skill || !player.unlockedSkills.includes(skillId)) return false;
  if ((player.skillCooldownEndTs[skillId] ?? 0) > now) return false;
  return hasManaForSkill(player, skillId);
}

function hasManaForSkill(player: PlayerState, skillId: SkillId): boolean {
  return player.mana >= (SKILLS[skillId]?.manaCost ?? Infinity);
}

function skillRange(skillId: SkillId): number {
  return Math.max(1, SKILLS[skillId]?.range ?? SKILLS[skillId]?.projectile?.maxRange ?? 1);
}

function approachPoint(
  from: { x: number; z: number },
  target: { x: number; z: number },
  range: number,
  desiredRangeFraction = 0.8,
): VecXZ {
  const distance = distanceXZ(from, target);
  if (distance <= 0.001) return { x: target.x, z: target.z };
  const desired = Math.max(0.5, range * desiredRangeFraction);
  const keep = Math.min(distance, desired);
  return {
    x: target.x + ((from.x - target.x) / distance) * keep,
    z: target.z + ((from.z - target.z) / distance) * keep,
  };
}

function nearestEntity(origin: SimEntity, candidates: readonly SimEntity[]): SimEntity | null {
  let nearest: SimEntity | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = distanceXZ(origin.position, candidate.position);
    if (distance < bestDistance) {
      nearest = candidate;
      bestDistance = distance;
    }
  }
  return nearest;
}

function livingEntities(state: GameState): SimEntity[] {
  return [
    ...Object.values(state.players).filter((player) => player.isAlive),
    ...Object.values(state.enemies).filter((enemy) => enemy.isAlive),
  ];
}

function collectCombatMetrics(events: readonly OutboundEvent[]): Omit<
  SimulationSummary,
  'now' | 'durationMs' | 'winnerTeamId' | 'livingTeamIds' | 'teams' | 'players' | 'enemies'
> {
  const metrics = emptyCombatMetrics();
  const seenCasts = new Set<string>();
  for (const event of events) {
    if (event.type !== 'serverMessage' || event.message.type !== 'CombatLog') continue;
    const log = event.message;
    if (!seenCasts.has(log.castId)) {
      seenCasts.add(log.castId);
      increment(metrics.castsBySkill, log.skillId, 1);
    }
    const damage = sum(log.damages);
    const healing = sum(log.heals ?? []);
    increment(metrics.damageDoneById, log.casterId, damage);
    increment(metrics.healingDoneById, log.casterId, healing);
    log.targets.forEach((targetId, index) => increment(metrics.damageTakenById, targetId, log.damages[index] ?? 0));
    metrics.misses += (log.misses ?? []).filter(Boolean).length;
  }
  return metrics;
}

function emptyCombatMetrics(): Omit<
  SimulationSummary,
  'now' | 'durationMs' | 'winnerTeamId' | 'livingTeamIds' | 'teams' | 'players' | 'enemies'
> {
  return {
    damageDoneById: {},
    damageTakenById: {},
    healingDoneById: {},
    castsBySkill: {},
    misses: 0,
  };
}

function entitySummary(entity: SimEntity, kind: 'player' | 'enemy', teamId: string): EntitySimulationSummary {
  return {
    id: entity.id,
    kind,
    teamId,
    alive: entity.isAlive,
    health: entity.health,
    maxHealth: entity.maxHealth,
    level: entity.level,
  };
}

function totalPlayerXp(player: PlayerState): number {
  let total = player.experience;
  for (let level = 1; level < player.level; level += 1) {
    total += getExperienceToNextLevel(level);
  }
  return total;
}

function makeCastReq(
  id: string,
  skillId: SkillId,
  now: number,
  targetId?: string,
  targetPos?: VecXZ,
  force?: boolean,
): CastReq {
  return { type: 'CastReq', id, skillId, targetId, targetPos, clientTs: now, force };
}

function increment(record: Record<string, number>, key: string, amount: number): void {
  record[key] = (record[key] ?? 0) + amount;
}

function sum(values: readonly number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function isEnemy(entity: SimEntity): entity is Enemy {
  return 'baseExperienceValue' in entity;
}

function toVec3(pos: VecXZ): { x: number; y: number; z: number } {
  return { x: pos.x, y: GROUND_Y, z: pos.z };
}
