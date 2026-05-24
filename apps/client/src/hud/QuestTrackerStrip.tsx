import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { QUESTS, type QuestDef } from '../../../../packages/content/quests';
import { QUEST_NPCS } from '../../../../packages/content/npcs';
import { getMiniBossById } from '../../../../packages/content/miniBosses';
import type { PlayerEntity } from '../gameTypes';
import { resolveStageMarker } from './questMarkers';

/**
 * §49/M2 PR008 — heads-up quest tracker.
 *
 * Always-visible strip showing the player's current objective so
 * the player doesn't have to keep the Quest panel open just to
 * see what's next.
 *
 * §52 playtest follow-up — the strip used to carry its own Next /
 * Claim / Show-on-map buttons, which duplicated the action surface
 * on the Quest panel and ran into stale-button race conditions
 * after a successful advance/claim. The strip is now label-only;
 * clicking it opens the Quest panel where the same actions live.
 * The visual completion pulse stays so the player still sees
 * "ready to claim" without opening anything.
 */
type QuestTrackerStripProps = {
  player: PlayerEntity | null;
  trackedQuestId?: string | null;
  onOpenQuestPanel?: () => void;
  /** Camera yaw in radians (0 = +Z forward). Drives the compass arrow rotation. */
  cameraAngleRef?: MutableRefObject<number>;
};

/**
 * Camera-relative bearing (degrees) from player to marker. 0° = the
 * direction the camera is currently facing, +90° = right, etc. Pure
 * function so it can be unit-tested without React.
 */
export function bearingToMarkerDeg(
  player: { x: number; z: number },
  marker: { x: number; z: number },
  cameraAngleRad: number,
): number {
  const dx = marker.x - player.x;
  const dz = marker.z - player.z;
  // atan2(x, z) gives world-space yaw matching the orbit-camera
  // convention (forward = -Z). Subtract camera yaw to get a
  // viewer-relative bearing. Convert to degrees for the CSS rotate.
  const worldYaw = Math.atan2(dx, -dz);
  const rel = worldYaw - cameraAngleRad;
  // Normalize to (-180, 180].
  let deg = (rel * 180) / Math.PI;
  while (deg > 180) deg -= 360;
  while (deg <= -180) deg += 360;
  return deg;
}

export function QuestTrackerStrip({
  player,
  trackedQuestId,
  onOpenQuestPanel,
  cameraAngleRef,
}: QuestTrackerStripProps) {
  const tracked = useMemo(() => pickTrackedStage(player, trackedQuestId ?? null), [player, trackedQuestId]);
  // Camera yaw is a ref (mutated in WorldScene's render loop). Poll
  // it on a 100ms interval — fast enough that the arrow follows the
  // camera smoothly without re-rendering the whole strip every frame.
  const [bearingDeg, setBearingDeg] = useState<number | null>(null);
  useEffect(() => {
    if (!tracked?.marker || !player) {
      setBearingDeg(null);
      return;
    }
    const id = window.setInterval(() => {
      const yaw = cameraAngleRef?.current ?? 0;
      setBearingDeg(bearingToMarkerDeg(player.position, tracked.marker!, yaw));
    }, 100);
    return () => window.clearInterval(id);
  }, [tracked?.marker, player, cameraAngleRef]);
  const trackedKey = tracked ? `${tracked.quest.id}-${tracked.stageIndex}` : null;
  const lastProgressRef = useRef<{ key: string | null; value: number }>({ key: trackedKey, value: tracked?.progress ?? 0 });
  const [bumpKey, setBumpKey] = useState(0);
  useEffect(() => {
    if (!tracked) {
      lastProgressRef.current = { key: null, value: 0 };
      return;
    }
    const prev = lastProgressRef.current;
    lastProgressRef.current = { key: trackedKey, value: tracked.progress };
    // Only pulse when the SAME stage's progress ticked up. Switching
    // quests or stages already has its own UI signal (panel state),
    // and we don't want a new tracker to flash for its baseline.
    if (prev.key === trackedKey && tracked.progress > prev.value) {
      setBumpKey((k) => k + 1);
    }
  }, [tracked, trackedKey]);
  if (!tracked) return null;
  const { quest, stageIndex, stage, progress, marker, readyToClaim } = tracked;
  const objectiveText = describeObjective(stage.objective, progress);
  const distance = marker && player ? distanceTo(player.position, marker) : null;
  const objectiveMet = isObjectiveMet(stage.objective, progress);
  const showNext = !readyToClaim && objectiveMet;
  // §49/M2 — light up the strip when the objective is met OR the
  // server has flipped readyToClaim. Two distinct states because
  // the player should be able to tell 'I just hit the goal' apart
  // from 'I can claim the reward right now'. Both flavours pulse
  // a brighter border so the strip yanks the eye toward the panel.
  const completionClass = readyToClaim
    ? ' quest-tracker-strip--ready'
    : (showNext ? ' quest-tracker-strip--objective-met' : '');
  // The whole strip is a single button now — clicking anywhere on
  // it opens the Quest panel. This keeps the heads-up info visible
  // without duplicating action buttons that the panel already owns.
  const hint = readyToClaim
    ? 'ready to claim — open quest'
    : showNext
      ? 'objective met — open quest'
      : 'open quest';
  return (
    <button
      type="button"
      className={`quest-tracker-strip quest-tracker-strip--button${completionClass}`}
      aria-label={`Tracked quest: ${quest.name}. ${hint}.`}
      onClick={() => onOpenQuestPanel?.()}
    >
      <div className="quest-tracker-text">
        <small className="quest-tracker-label">Quest</small>
        <strong>{quest.name}</strong>
        <small className="quest-tracker-stage">
          Stage {stageIndex + 1}/{quest.stages.length}: {objectiveText}
        </small>
        {distance !== null && (
          <small className="quest-tracker-distance">{formatDistance(distance)} away</small>
        )}
      </div>
      {bearingDeg !== null && (
        <span
          className="quest-tracker-compass"
          style={{ transform: `rotate(${bearingDeg}deg)` }}
          aria-hidden="true"
        >
          ▲
        </span>
      )}
      <span className="quest-tracker-hint" aria-hidden="true">{hint}</span>
      {bumpKey > 0 && (
        <span key={`pulse-${bumpKey}`} className="quest-tracker-strip__pulse" aria-hidden="true" />
      )}
    </button>
  );
}

function distanceTo(from: { x: number; z: number }, to: { x: number; z: number }): number {
  const dx = from.x - to.x;
  const dz = from.z - to.z;
  return Math.hypot(dx, dz);
}

export function formatDistance(metres: number): string {
  if (metres < 1) return '<1 m';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export type TrackedStage = {
  quest: QuestDef;
  stageIndex: number;
  stage: QuestDef['stages'][number];
  progress: number;
  marker: { x: number; z: number } | null;
  readyToClaim: boolean;
};

/**
 * §52 playtest follow-up — the strip used to lock onto whichever
 * quest happened to be first in `Object.entries(active)`, ignoring
 * the player's selection in QuestPanel. Now honors `trackedQuestId`
 * when set (and the quest is still active), falling back to the
 * first active quest otherwise. The fallback keeps the legacy
 * single-quest UX working for fresh players who haven't picked
 * anything yet.
 */
export function pickTrackedStage(
  player: PlayerEntity | null,
  trackedQuestId: string | null = null,
): TrackedStage | null {
  if (!player?.questState?.active) return null;
  const active = player.questState.active;
  const preferred = trackedQuestId && active[trackedQuestId] ? trackedQuestId : null;
  const order = preferred ? [preferred, ...Object.keys(active).filter((id) => id !== preferred)] : Object.keys(active);
  for (const questId of order) {
    const entry = active[questId];
    if (!entry) continue;
    const quest = QUESTS[questId];
    if (!quest) continue;
    const stage = quest.stages[entry.stageIndex];
    if (!stage) continue;
    const giver = QUEST_NPCS[quest.npcId];
    const marker = resolveStageMarker(stage, giver?.position ?? null, entry.readyToClaim ?? false);
    return {
      quest,
      stageIndex: entry.stageIndex,
      stage,
      progress: entry.progress,
      marker,
      readyToClaim: entry.readyToClaim ?? false,
    };
  }
  return null;
}

/**
 * Has the player satisfied the objective enough that Next should be
 * tappable? Mirrors the "press Next" copy in describeObjective so
 * the button and the prompt agree.
 */
export function isObjectiveMet(
  objective: QuestDef['stages'][number]['objective'],
  progress: number,
): boolean {
  switch (objective.kind) {
    case 'kill':
      return progress >= objective.count;
    case 'kill_boss':
    case 'reach':
    case 'talk':
      return progress >= 1;
    case 'manual':
      return true;
    default:
      return false;
  }
}

function describeObjective(
  objective: QuestDef['stages'][number]['objective'],
  progress: number,
): string {
  switch (objective.kind) {
    case 'kill':
      return `${progress}/${objective.count} ${objective.enemyType}`;
    case 'kill_boss': {
      const boss = getMiniBossById(objective.bossId);
      return progress >= 1
        ? `${boss?.name ?? objective.bossId} slain — press Next`
        : `slay ${boss?.name ?? objective.bossId}`;
    }
    case 'reach':
      return progress >= 1 ? 'at waypoint — press Next' : 'travel to marker';
    case 'talk': {
      const npc = QUEST_NPCS[objective.npcId];
      return progress >= 1 ? 'spoke — press Next' : `return to ${npc?.name ?? objective.npcId}`;
    }
    case 'manual':
      return 'press Next when ready';
    default:
      return '';
  }
}

