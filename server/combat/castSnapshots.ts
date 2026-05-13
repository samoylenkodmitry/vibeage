import type { CastSnapshot } from '../../shared/types.js';
import type { Cast } from './skillSystem.js';

export function makeCastSnapshot(cast: Cast): CastSnapshot {
  return {
    castId: cast.castId,
    casterId: cast.casterId,
    skillId: cast.skillId,
    state: cast.state,
    startedAt: cast.startedAt,
    castTimeMs: cast.castTimeMs,
    progressMs: cast.progressMs || 0,
    origin: cast.origin,
    pos: cast.pos,
    dir: cast.dir,
  };
}

export function emitCastSnapshot(client: { emit: (event: string, payload: unknown) => void }, cast: Cast): void {
  client.emit('msg', {
    type: 'CastSnapshot',
    data: makeCastSnapshot(cast),
  });
}
