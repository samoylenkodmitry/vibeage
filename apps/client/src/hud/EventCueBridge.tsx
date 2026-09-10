import { useEffect, useRef } from 'react';
import { playCue, type CueId } from '../audio/cues';
import type { CombatLine } from '../gameTypes';
import { cueForCombatLineId, cueRateJitter, questCues, type QuestActiveView } from './eventCues';

type EventCueBridgeProps = {
  combatLog: readonly CombatLine[];
  /** `player.questState?.active` — passed raw so its identity stays stable. */
  questActive: QuestActiveView | undefined;
};

/** Stable stand-in for "no quest state yet" — a fresh {} would re-run the effect every render. */
const NO_QUESTS: QuestActiveView = {};

/**
 * One headless bridge for the events that used to happen in silence: looting,
 * equipping, learning a skill, accepting a quest, advancing a quest stage.
 *
 * All of them already land somewhere the HUD can see — the combat log (from
 * owner-only server messages) or `questState.active` — so a single watcher
 * beats sprinkling playCue() through the inventory, skill-tree and quest
 * panels, none of which is the component that *learns* the event.
 *
 * Every cue is rate-limited per cue id: a stack of loot arrives as several
 * lines in one frame and a fast looter shouldn't be machine-gunned. Sibling to
 * [[CombatSfxBridge]] / [[LifeCueBridge]] / [[ChatReceiveCue]].
 */
const COOLDOWN_MS: Record<string, number> = { loot: 260, equip: 160, questStage: 400 };
const DEFAULT_COOLDOWN_MS = 220;
/** Cues that repeat often enough to need pitch variety (see cueRateJitter). */
const JITTERED: ReadonlySet<CueId> = new Set<CueId>(['loot', 'equip']);

export function EventCueBridge({ combatLog, questActive }: EventCueBridgeProps) {
  const seenLinesRef = useRef<Set<string>>(new Set(combatLog.map((line) => line.id)));
  const questPrevRef = useRef<QuestActiveView | null>(null);
  const lastCueAtRef = useRef<Map<CueId, number>>(new Map());

  // Shared gate so a burst of same-kind events collapses into one audible cue.
  const fire = (cue: CueId): void => {
    const now = performance.now();
    const last = lastCueAtRef.current.get(cue) ?? -Infinity;
    if (now - last < (COOLDOWN_MS[cue] ?? DEFAULT_COOLDOWN_MS)) return;
    lastCueAtRef.current.set(cue, now);
    playCue(cue, JITTERED.has(cue) ? cueRateJitter() : 1);
  };

  useEffect(() => {
    const seen = seenLinesRef.current;
    for (const line of combatLog) {
      if (seen.has(line.id)) continue;
      seen.add(line.id);
      const cue = cueForCombatLineId(line.id);
      if (cue) fire(cue);
    }
    // The log is capped at 200 lines; prune the seen-set with it so a long
    // session doesn't grow an unbounded Set of ids that can never return.
    if (seen.size > combatLog.length + 64) {
      const live = new Set(combatLog.map((line) => line.id));
      for (const id of seen) if (!live.has(id)) seen.delete(id);
    }
  }, [combatLog]);

  useEffect(() => {
    const active = questActive ?? NO_QUESTS;
    const prev = questPrevRef.current;
    questPrevRef.current = active;
    // First snapshot is baseline: a reconnect must not re-accept every quest.
    if (prev === null) return;
    for (const cue of questCues(prev, active)) fire(cue);
  }, [questActive]);

  return null;
}
