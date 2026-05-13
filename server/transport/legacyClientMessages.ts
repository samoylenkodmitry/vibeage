import type { CastReq, MoveIntent } from '../../packages/protocol/messages.js';

type LegacyMoveStart = {
  id?: string;
  to?: { x: number; z: number };
  speed?: number;
  ts?: number;
};

type LegacyMoveStop = {
  id?: string;
  pos?: { x: number; z: number };
  ts?: number;
};

type LegacyCastSkillRequest = {
  skillId?: CastReq['skillId'];
  targetId?: string;
};

export function legacyMoveStartToClientMessage(message: LegacyMoveStart): MoveIntent {
  return {
    type: 'MoveIntent',
    id: message.id ?? '',
    targetPos: message.to ?? { x: 0, z: 0 },
    clientTs: message.ts ?? Date.now(),
  };
}

export function legacyMoveStopToClientMessage(message: LegacyMoveStop): MoveIntent {
  return {
    type: 'MoveIntent',
    id: message.id ?? '',
    targetPos: message.pos ?? { x: 0, z: 0 },
    clientTs: message.ts ?? Date.now(),
  };
}

export function legacyCastSkillRequestToClientMessage(
  data: LegacyCastSkillRequest,
  playerId: string | undefined,
): CastReq {
  return {
    type: 'CastReq',
    id: playerId ?? '',
    skillId: data.skillId ?? 'fireball',
    targetId: data.targetId,
    clientTs: Date.now(),
  };
}
