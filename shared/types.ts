export interface StatusEffect {
    id: string;
    type: string;
    value: number;
    durationMs: number;
    startTimeTs: number;
    sourceSkill: string;
}

export interface Enemy {
    id: string;
    type: string;
    name: string;
    level: number;
    position: { x: number; y: number; z: number };
    spawnPosition: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    health: number;
    maxHealth: number;
    isAlive: boolean;
    attackDamage: number;
    attackRange: number;
    baseExperienceValue: number;
    experienceValue: number;
    statusEffects: StatusEffect[];
    targetId?: string | null;
    markedForRemoval?: boolean;
    deathTimeTs?: number;
    attackCooldown?: boolean;
}

// Vector with X/Z coordinates only (for ground movement)
export interface VecXZ {
    x: number;
    z: number;
}

// Intent-based movement messages
export interface MoveStartMsg {
    type: 'moveStart';
    id: string;            // playerId
    from: VecXZ;           // current server-accepted pos (xz only)
    to: VecXZ;             // destination clicked on ground
    speed: number;         // client's intended speed (u/s)
    ts: number;            // client epoch ms when click happened
}

export interface MoveStopMsg {
    type: 'moveStop';
    id: string;
    pos: VecXZ;            // here the client thinks he stopped
    ts: number;
}

// Movement state for player
export interface PlayerMovementState {
    dest: VecXZ | null;    // null when idle
    speed: number;         // server-clamped speed
    startTs: number;       // server time when move accepted
}

// Update PlayerState with optional movement field
export interface PlayerState {
    id: string;
    socketId: string;
    name: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
    skills: string[];
    skillCooldownEndTs: Record<string, number>;
    statusEffects: StatusEffect[];
    level: number;
    experience: number;
    experienceToNextLevel: number;
    castingSkill: string | null;
    castingProgressMs: number;
    isAlive: boolean;
    deathTimeTs?: number;
    lastUpdateTime?: number;
    movement?: PlayerMovementState;
}
