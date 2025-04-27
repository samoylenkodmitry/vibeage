export interface VecXZ { x: number; z: number }
export interface PlayerMovementState {
  dest: VecXZ | null;
  speed: number;
  startTs: number;
}

// Define a union type for all skill IDs to ensure consistency
export type SkillId = 'fireball' | 'iceBolt' | 'waterSplash' | 'petrify';

export interface MoveStart { type: 'MoveStart'; id: string; path: VecXZ[]; speed: number; clientTs: number }
export interface MoveSync { type: 'MoveSync'; id: string; pos: VecXZ; clientTs: number }
export interface CastReq { type: 'CastReq'; id: string; skillId: SkillId; targetId?: string; targetPos?: VecXZ; clientTs: number }

export type ClientMsg = MoveStart | MoveSync | CastReq

export interface PosSnap { id: string; pos: VecXZ; vel: VecXZ; snapTs: number }
export interface CastStart { id: string; skillId: SkillId; castMs: number; }
export interface CastEnd { id: string; skillId: SkillId; success: boolean }

export type ServerMsg =
  | { type: 'MoveStart' } & MoveStart
  | { type: 'PosSnap', snaps: PosSnap[] }
  | { type: 'CastStart' } & CastStart
  | { type: 'CastEnd' } & CastEnd
