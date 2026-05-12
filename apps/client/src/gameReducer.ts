import type { SkillId } from '../../../packages/content/skills';
import { CastState, type CastSnapshot, type ServerMessage } from '../../../packages/protocol/messages';
import type {
  CombatLine,
  EnemyEntity,
  GameClientState,
  PlayerEntity,
  ServerGameState,
  Vec3,
} from './gameTypes';

const CAST_VISIBLE_MS = 3_000;
const MAX_COMBAT_LINES = 5;

export const initialGameClientState: GameClientState = {
  connectionState: 'idle',
  message: 'Ready',
  myPlayerId: null,
  players: {},
  enemies: {},
  selectedTargetId: null,
  targetWorldPos: null,
  casts: {},
  inventory: [],
  combatLog: [],
};

export type GameClientAction =
  | { type: 'startConnecting' }
  | { type: 'connected' }
  | { type: 'joined'; playerId: string }
  | { type: 'connectionRejected'; message: string }
  | { type: 'disconnected'; message: string }
  | { type: 'gameState'; state: ServerGameState }
  | { type: 'playerJoined'; player: PlayerEntity }
  | { type: 'playerLeft'; playerId: string }
  | { type: 'playerUpdated'; player: Partial<PlayerEntity> & { id: string } }
  | { type: 'enemyUpdated'; enemy: Partial<EnemyEntity> & { id: string } }
  | { type: 'selectTarget'; targetId: string | null }
  | { type: 'setMoveTarget'; target: Vec3 | null }
  | { type: 'serverMessage'; message: ServerMessage; now: number }
  | { type: 'pruneCasts'; now: number };

export function gameClientReducer(
  state: GameClientState,
  action: GameClientAction,
): GameClientState {
  switch (action.type) {
    case 'startConnecting':
      return { ...initialGameClientState, connectionState: 'connecting', message: 'Connecting' };
    case 'connected':
      return { ...state, connectionState: 'joining', message: 'Joining world' };
    case 'joined':
      return { ...state, connectionState: 'online', message: 'Online', myPlayerId: action.playerId };
    case 'connectionRejected':
      return { ...state, connectionState: 'rejected', message: action.message };
    case 'disconnected':
      return { ...state, connectionState: 'offline', message: action.message };
    case 'gameState':
      return applyGameState(state, action.state);
    case 'playerJoined':
      return { ...state, players: { ...state.players, [action.player.id]: action.player } };
    case 'playerLeft':
      return removePlayer(state, action.playerId);
    case 'playerUpdated':
      return updatePlayer(state, action.player);
    case 'enemyUpdated':
      return updateEnemy(state, action.enemy);
    case 'selectTarget':
      return selectTarget(state, action.targetId);
    case 'setMoveTarget':
      return { ...state, targetWorldPos: action.target };
    case 'serverMessage':
      return applyServerMessage(state, action.message, action.now);
    case 'pruneCasts':
      return { ...state, casts: pruneCasts(state.casts, action.now) };
  }
}

function applyGameState(state: GameClientState, serverState: ServerGameState): GameClientState {
  const players = serverState.players ?? {};
  const enemies = serverState.enemies ?? {};
  const selectedTargetId = enemies[state.selectedTargetId ?? ''] ? state.selectedTargetId : null;
  const inventory = state.myPlayerId ? players[state.myPlayerId]?.inventory ?? state.inventory : state.inventory;

  return { ...state, players, enemies, selectedTargetId, inventory };
}

function removePlayer(state: GameClientState, playerId: string): GameClientState {
  const players = { ...state.players };
  delete players[playerId];
  return { ...state, players };
}

function updatePlayer(
  state: GameClientState,
  update: Partial<PlayerEntity> & { id: string },
): GameClientState {
  const current = state.players[update.id];
  if (!current) {
    return state;
  }

  const player = {
    ...current,
    ...update,
    position: mergeVec3(current.position, update.position),
    rotation: mergeVec3(current.rotation, update.rotation),
  };
  const inventory = state.myPlayerId === update.id && update.inventory ? update.inventory : state.inventory;

  return { ...state, players: { ...state.players, [update.id]: player }, inventory };
}

function updateEnemy(
  state: GameClientState,
  update: Partial<EnemyEntity> & { id: string },
): GameClientState {
  const current = state.enemies[update.id];
  if (!current) {
    return state;
  }

  const enemy = {
    ...current,
    ...update,
    position: mergeVec3(current.position, update.position),
    rotation: mergeVec3(current.rotation, update.rotation),
  };
  const selectedTargetId = enemy.isAlive ? state.selectedTargetId : clearDeadTarget(state, update.id);

  return { ...state, enemies: { ...state.enemies, [update.id]: enemy }, selectedTargetId };
}

function selectTarget(state: GameClientState, targetId: string | null): GameClientState {
  const selectedTargetId = targetId && state.enemies[targetId]?.isAlive ? targetId : null;
  return { ...state, selectedTargetId };
}

function applyServerMessage(
  state: GameClientState,
  message: ServerMessage,
  now: number,
): GameClientState {
  if (message.type === 'BatchUpdate') {
    return message.updates.reduce(
      (nextState, update) => applyServerMessage(nextState, update, now),
      state,
    );
  }

  if (message.type === 'PosSnap') {
    return applyPositionSnapshot(state, message);
  }

  if (message.type === 'CastSnapshot') {
    return addCastSnapshot(state, message.data, now);
  }

  if (message.type === 'CombatLog') {
    return addCombatLine(state, {
      id: makeCombatLineId(message.castId, state.combatLog.length, now),
      text: `${message.skillId} hit ${message.targets.length} target(s)`,
    });
  }

  if (message.type === 'CastFail') {
    return { ...state, message: `Cast failed: ${message.reason}` };
  }

  if (message.type === 'InventoryUpdate') {
    return { ...state, inventory: message.inventory };
  }

  return state;
}

function applyPositionSnapshot(state: GameClientState, message: ServerMessage & { type: 'PosSnap' }) {
  const asPosition = { x: message.pos.x, z: message.pos.z };
  if (state.players[message.id]) {
    return updatePlayer(state, {
      id: message.id,
      position: { ...state.players[message.id].position, ...asPosition },
      rotation: { ...state.players[message.id].rotation, y: message.rotY ?? 0 },
      velocity: message.vel,
    });
  }

  if (state.enemies[message.id]) {
    return updateEnemy(state, {
      id: message.id,
      position: { ...state.enemies[message.id].position, ...asPosition },
      rotation: { ...state.enemies[message.id].rotation, y: message.rotY ?? 0 },
      velocity: message.vel,
    });
  }

  return state;
}

function addCastSnapshot(
  state: GameClientState,
  snapshot: CastSnapshot,
  now: number,
): GameClientState {
  const casts = {
    ...state.casts,
    [snapshot.castId]: { snapshot, seenAt: now },
  };
  const message = snapshot.state === CastState.Impact ? `${snapshot.skillId} impact` : state.message;

  return { ...state, casts, message };
}

function addCombatLine(state: GameClientState, line: CombatLine): GameClientState {
  return { ...state, combatLog: [line, ...state.combatLog].slice(0, MAX_COMBAT_LINES) };
}

function makeCombatLineId(castId: string, currentLineCount: number, now: number): string {
  return `${castId}:${now}:${currentLineCount}`;
}

function pruneCasts(casts: GameClientState['casts'], now: number): GameClientState['casts'] {
  return Object.fromEntries(
    Object.entries(casts).filter(([, cast]) => now - cast.seenAt < CAST_VISIBLE_MS),
  );
}

function mergeVec3(current: Vec3, update: Partial<Vec3> | undefined): Vec3 {
  return update ? { ...current, ...update } : current;
}

function clearDeadTarget(state: GameClientState, enemyId: string): string | null {
  return state.selectedTargetId === enemyId ? null : state.selectedTargetId;
}

export function getPlayerPosition(player: PlayerEntity | null): Vec3 {
  return player?.position ?? { x: 0, y: 0.5, z: 0 };
}

export function getNearestAliveEnemyId(
  enemies: Record<string, EnemyEntity>,
  origin: Vec3,
): string | null {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const enemy of Object.values(enemies)) {
    if (!enemy.isAlive) {
      continue;
    }

    const distance = distanceSq(origin, enemy.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = enemy.id;
    }
  }

  return bestId;
}

function distanceSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export function getHotkeySkill(
  player: PlayerEntity | null,
  slotIndex: number,
): SkillId | null {
  return player?.skillShortcuts?.[slotIndex] ?? player?.unlockedSkills?.[slotIndex] ?? null;
}
