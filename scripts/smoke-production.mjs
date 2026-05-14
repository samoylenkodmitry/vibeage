import { Client } from '@colyseus/sdk';

const domain = process.env.DOMAIN || 'vibeage.eu';
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 12_000);
const playerName = process.env.SMOKE_PLAYER_NAME || `Smoke${Date.now()}`;
const endpoint = `https://${domain}/colyseus`;

const client = new Client(endpoint, {
  headers: {
    Origin: `https://${domain}`,
  },
});

let room;

try {
  room = await client.joinOrCreate('world', {
    playerName,
    clientProtocolVersion: 2,
  });

  const result = await waitForRoomSnapshot(room, timeoutMs);
  const aliveEnemies = Object.values(result.gameState.enemies ?? {})
    .filter((enemy) => enemy?.isAlive !== false);

  if (!result.playerId) {
    throw new Error('joinGame did not include playerId');
  }

  if (!result.gameState.players?.[result.playerId]) {
    throw new Error(`gameState did not include joined player ${result.playerId}`);
  }

  if (aliveEnemies.length === 0) {
    throw new Error('gameState did not include alive enemies');
  }

  console.log(`Production smoke OK: room=${room.roomId} session=${room.sessionId} player=${result.playerId} enemies=${aliveEnemies.length}`);
} finally {
  await room?.leave(true).catch(() => undefined);
}

function waitForRoomSnapshot(room, timeoutMs) {
  return new Promise((resolve, reject) => {
    const snapshot = {
      playerId: null,
      gameState: null,
    };
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for joinGame and gameState'));
    }, timeoutMs);

    const finishIfReady = () => {
      if (!snapshot.playerId || !snapshot.gameState) {
        return;
      }

      clearTimeout(timeout);
      resolve(snapshot);
    };

    room.onMessage('joinGame', (payload) => {
      snapshot.playerId = typeof payload?.playerId === 'string' ? payload.playerId : null;
      finishIfReady();
    });
    room.onMessage('gameState', (gameState) => {
      snapshot.gameState = gameState;
      finishIfReady();
    });
    room.onMessage('msg', () => undefined);
    room.onError((code, message) => {
      clearTimeout(timeout);
      reject(new Error(`Room error ${code}: ${message}`));
    });
    room.onLeave((code) => {
      if (!snapshot.playerId || !snapshot.gameState) {
        clearTimeout(timeout);
        reject(new Error(`Room left before snapshot, code=${code}`));
      }
    });

    room.send('requestGameState');
    room.send('msg', { type: 'RequestInventory' });
  });
}
