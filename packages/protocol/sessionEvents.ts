export const SESSION_EVENTS = {
  joinGame: 'joinGame',
  requestGameState: 'requestGameState',
  message: 'msg',
  disconnect: 'disconnect',
  connectionRejected: 'connectionRejected',
  playerJoined: 'playerJoined',
  playerLeft: 'playerLeft',
  gameState: 'gameState',
  playerUpdated: 'playerUpdated',
  enemyUpdated: 'enemyUpdated',
} as const;

export type SessionEventKey = keyof typeof SESSION_EVENTS;
export type SessionEventName = typeof SESSION_EVENTS[SessionEventKey];
