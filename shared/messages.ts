export interface VecXZ { x: number; z: number }
export interface PlayerMovementState {
  dest: VecXZ | null;
  speed: number;
  startTs: number;
}

// Define a union type for all skill IDs to ensure consistency
import { SkillId } from './skillsDefinition.js';

export interface MoveStart { type: 'MoveStart'; id: string; path: VecXZ[]; speed: number; clientTs: number }
export interface MoveSync { type: 'MoveSync'; id: string; pos: VecXZ; clientTs: number }
export interface CastReq { type: 'CastReq'; id: string; skillId: SkillId; targetId?: string; targetPos?: VecXZ; clientTs: number }

export type ClientMsg = MoveStart | MoveSync | CastReq

export interface PosSnap { id: string; pos: VecXZ; vel: VecXZ; ts: number }
export interface CastStart { id: string; skillId: SkillId; castMs: number; }
export interface CastEnd { id: string; skillId: SkillId; success: boolean }

export interface ProjSpawn { type:'ProjSpawn'; id:string; skillId:SkillId;
  origin:{x:number;y:number;z:number}; dir:{x:number;y:number;z:number};
  speed:number; launchTs:number; }

export interface ProjHit  { type:'ProjHit';  id:string; pos:{x:number;y:number;z:number}; hitIds:string[] }
export interface ProjEnd  { type:'ProjEnd';  id:string; pos:{x:number;y:number;z:number} }

export interface InstantHit { type:'InstantHit'; skillId:SkillId;
  origin:{x:number;y:number;z:number}; targetPos:{x:number;y:number;z:number}; hitIds:string[] }

export type ServerMsg =
  | { type: 'MoveStart' } & MoveStart
  | { type: 'PosSnap', snaps: PosSnap[] }
  | { type: 'CastStart' } & CastStart
  | { type: 'CastEnd' } & CastEnd
  | ProjSpawn | ProjHit | ProjEnd | InstantHit
