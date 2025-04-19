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
