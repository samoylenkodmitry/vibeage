export type QuestVec3 = { x: number; y: number; z: number };

/**
 * Quest system — pure data. The engine reads QUESTS + NPC_QUEST_GIVERS;
 * no per-quest conditionals live in code. Adding a quest means
 * appending an entry here and (optionally) wiring an NPC to offer it.
 *
 * Quest shape:
 *   - stages[] runs in order; only the current stage's objective is
 *     evaluated. When the current stage's objective is met the
 *     player may press Next to advance; on the last stage Next
 *     becomes Claim (rewards granted, quest moved to completed).
 *   - kill/reach objectives auto-progress (engine ticks count /
 *     distance every relevant event); manual objectives require
 *     the player to press Next.
 */

export type QuestStageObjective =
  | { kind: 'kill'; enemyType: string; count: number }
  | { kind: 'reach'; position: QuestVec3; radius: number }
  | { kind: 'talk'; npcId: string }
  | { kind: 'manual'; description: string };

export interface QuestStage {
  id: string;
  description: string;
  objective: QuestStageObjective;
  /** Optional map marker for this stage (defaults to objective position when applicable). */
  marker?: QuestVec3;
}

export interface QuestReward {
  xp?: number;
  gold?: number;
  /** Item template ids to grant. Quantity defaults to 1 each. */
  items?: ReadonlyArray<{ itemId: string; quantity?: number }>;
}

export interface QuestDef {
  id: string;
  name: string;
  description: string;
  /** NPC that offers + completes the quest (id from NPC_QUEST_GIVERS). */
  npcId: string;
  /** Minimum level to accept. */
  minLevel: number;
  stages: QuestStage[];
  reward: QuestReward;
}

export type QuestId = string;

export const QUESTS: Record<QuestId, QuestDef> = {
  rats_in_the_cellar: {
    id: 'rats_in_the_cellar',
    name: 'Rats in the Cellar',
    description: 'The Talking Island warden needs help clearing the goblin den.',
    npcId: 'warden_galen',
    minLevel: 1,
    stages: [
      {
        id: 'kill_goblins',
        description: 'Slay 3 goblins near Talking Island.',
        objective: { kind: 'kill', enemyType: 'goblin', count: 3 },
      },
      {
        id: 'report_back',
        description: 'Return to Warden Galen.',
        objective: { kind: 'talk', npcId: 'warden_galen' },
      },
    ],
    reward: { xp: 120, gold: 25, items: [{ itemId: 'health_potion', quantity: 2 }] },
  },
  scout_the_road: {
    id: 'scout_the_road',
    name: 'Scout the Road',
    description: 'Walk the path toward Gludin and report what you see.',
    npcId: 'warden_galen',
    minLevel: 3,
    stages: [
      {
        id: 'reach_waypoint',
        description: 'Reach the waypoint south-east of the village.',
        objective: { kind: 'reach', position: { x: 60, y: 0.5, z: 40 }, radius: 5 },
        marker: { x: 60, y: 0.5, z: 40 },
      },
      {
        id: 'report_findings',
        description: 'Return and tell the warden what you saw.',
        objective: { kind: 'manual', description: 'Press Next to give your report.' },
      },
    ],
    reward: { xp: 200, gold: 40 },
  },
  cull_the_horde: {
    id: 'cull_the_horde',
    name: 'Cull the Horde',
    description: 'A larger goblin band is being seen further out. Cut their numbers.',
    npcId: 'captain_vorr',
    minLevel: 8,
    stages: [
      {
        id: 'slay_band',
        description: 'Defeat 8 goblins.',
        objective: { kind: 'kill', enemyType: 'goblin', count: 8 },
      },
    ],
    reward: { xp: 600, gold: 120, items: [{ itemId: 'mana_potion', quantity: 3 }] },
  },
};

/** All quests offered by an NPC. */
export function getQuestsOfferedBy(npcId: string): QuestDef[] {
  return Object.values(QUESTS).filter((q) => q.npcId === npcId);
}
