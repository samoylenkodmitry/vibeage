import type { CueId } from '../audio/cues';

/**
 * Which HUD cue (if any) a client-side event deserves — kept pure and separate
 * from [[EventCueBridge]] so the classification is unit-testable without a
 * DOM or an AudioContext.
 *
 * Combat-log ids are the client's honest record of "the server told us this
 * happened": every line id is `${prefix}:${ts}:${index}` (see
 * clientVisualState.makeCombatLineId), and the loot / equip / skill-learn
 * prefixes come from owner-only server messages, so a match is always the
 * *local* player's event — never someone else's loot.
 */
const LINE_PREFIX_CUES: ReadonlyArray<readonly [string, CueId]> = [
  ['loot-', 'loot'], // LootAcquired — the most repeated action in the game
  ['equip-', 'equip'], // EquipmentUpdate slot diff (equipfail- deliberately excluded)
  ['learn-', 'learnSkill'], // SkillLearned
];

export function cueForCombatLineId(id: string): CueId | null {
  for (const [prefix, cue] of LINE_PREFIX_CUES) {
    if (id.startsWith(prefix)) return cue;
  }
  return null;
}

/** The slice of `player.questState.active` the quest cues diff. */
export type QuestActiveView = Readonly<Record<string, { stageIndex: number }>>;

/**
 * Quest cues come from state, not a message: a new key in `questState.active`
 * is an accept, a higher `stageIndex` on an existing key is a stage advance.
 * (Completion already has its own burst + cue in [[QuestCompleteBurst]], and a
 * quest leaving `active` is exactly that, so it stays silent here.)
 *
 * `prev` empty means "first snapshot" to the caller, which must skip us — a
 * reconnect would otherwise fire an accept cue for every quest in the log.
 */
export function questCues(prev: QuestActiveView, next: QuestActiveView): CueId[] {
  const cues: CueId[] = [];
  for (const [id, entry] of Object.entries(next)) {
    const before = prev[id];
    if (!before) cues.push('questAccept');
    else if (entry.stageIndex > before.stageIndex) cues.push('questStage');
  }
  return cues;
}

/**
 * Repeated cues need pitch variety or twenty pickups in a minute read as a
 * stuck sample. A narrow window (±6%) — wide enough to hear as "another coin",
 * narrow enough that it never sounds like a different sound.
 */
export function cueRateJitter(): number {
  return 0.94 + Math.random() * 0.12;
}
