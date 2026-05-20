import { ITEMS } from '../../../packages/content/items';
import { SKILLS } from '../../../packages/content/skills';
import {
  CastState,
  type CastSnapshot,
  type ItemDrop,
  type ServerMessage,
} from '../../../packages/protocol/messages';
import { addCombatDamageVisualEvents } from './combatFeedback';
import type { CombatLine, GameClientState, Vec3 } from './gameTypes';
import { normalizeVec3 } from './vec3';
import { addVisualEvent, pruneVisualEvents } from './visualEventState';

const CAST_VISIBLE_MS = 3_000;
// PR MM — was 5 to fit the static strip; the scrollable chat panel
// carries real history now. 200 lines is plenty for a long session
// without the DOM growing unbounded.
const MAX_COMBAT_LINES = 200;

export function applyCombatLogVisualState(
  state: GameClientState,
  message: ServerMessage & { type: 'CombatLog' },
  now: number,
): GameClientState {
  const withDamageFeedback = addCombatDamageVisualEvents(state, message, now);

  return addCombatLine(withDamageFeedback, {
    id: makeCombatLineId(message.castId, state.combatLog.length, now),
    text: formatCombatLogLine(state, message.skillId, message.targets, message.damages, message.crits),
  });
}

export function applyCastFailVisualState(
  state: GameClientState,
  message: ServerMessage & { type: 'CastFail' },
  now: number,
): GameClientState {
  const text = `Cast failed: ${message.reason}`;
  return addCombatLine(
    state,
    { id: makeCombatLineId(`fail-${message.clientSeq}`, state.combatLog.length, now), text },
  );
}

export function applyEnemyAttackVisualState(
  state: GameClientState,
  message: ServerMessage & { type: 'EnemyAttack' },
  now: number,
): GameClientState {
  return addCombatLine(state, {
    id: makeCombatLineId(`${message.enemyId}-${message.targetId}`, state.combatLog.length, now),
    text: formatEnemyAttackLine(state, message.enemyId, message.targetId, message.damage),
  });
}

export function applyLootAcquiredVisualState(
  state: GameClientState,
  message: ServerMessage & { type: 'LootAcquired' },
  now: number,
): GameClientState {
  return addCombatLine(state, {
    id: makeCombatLineId(`loot-${now}`, state.combatLog.length, now),
    text: `Picked up ${formatItemDrops(message.items)}`,
  });
}

/**
 * §49/M2 — surface EquipFailed in the combat log so the player
 * actually sees why an Equip/Unequip dropped silently. Reason is
 * a stable enum-ish string from the server; we map the common ones
 * to player-friendly copy + fall back to the raw reason otherwise.
 */
export function applyEquipFailedVisualState(
  state: GameClientState,
  message: ServerMessage & { type: 'EquipFailed' },
  now: number,
): GameClientState {
  return addCombatLine(state, {
    id: makeCombatLineId(`equipfail-${message.reason}`, state.combatLog.length, now),
    text: `Couldn't equip: ${equipReasonCopy(message.reason)}`,
  });
}

/**
 * §49/M2 — log "Equipped X" for any item that landed in a slot
 * since the last EquipmentUpdate. Diffs the incoming equipment
 * payload against the slot map already in client state. Skips the
 * very first update after spawn (the entire payload would look
 * "newly equipped" otherwise).
 */
export function applyEquipmentChangeFeedback(
  state: GameClientState,
  message: ServerMessage & { type: 'EquipmentUpdate' },
  now: number,
): GameClientState {
  // Treat an initial-empty equipment map as "first run, don't log".
  // After that, any slot that changed itemId or appeared fresh is a
  // user-facing "Equipped X" line.
  const prev = state.equipment ?? {};
  const isInitial = Object.keys(prev).length === 0;
  if (isInitial) return state;
  let next: GameClientState = state;
  for (const entry of message.equipment) {
    const wasItem = prev[entry.slot];
    if (wasItem === entry.itemId) continue;
    const itemName = getItemName(entry.itemId);
    next = addCombatLine(next, {
      id: makeCombatLineId(`equip-${entry.slot}-${entry.itemId}`, next.combatLog.length, now),
      text: `Equipped ${itemName}`,
    });
  }
  return next;
}

function equipReasonCopy(reason: string): string {
  switch (reason) {
    case 'itemNotFound': return "that item isn't in your bag";
    case 'levelTooLow': return 'you need a higher level for this item';
    case 'wrongClass': return "your class can't use this item";
    case 'wrongRace': return "your race can't use this item";
    case 'slotConflict': return 'another item is in the way';
    case 'handConflict': return 'your hands are full';
    case 'notEquippable': return "that item can't be equipped";
    default: return reason;
  }
}

export function applyOtherPlayerLootPickupVisualState(
  state: GameClientState,
  lootId: string,
  playerName: string,
  now: number,
): GameClientState {
  return addCombatLine(state, {
    id: makeCombatLineId(`pickup-${lootId}`, state.combatLog.length, now),
    text: `${playerName} picked up loot`,
  });
}

export function applyCastSnapshotVisualState(
  state: GameClientState,
  snapshot: CastSnapshot,
  now: number,
): GameClientState {
  const nextState = addCastSnapshot(state, snapshot, now);
  if (snapshot.state !== CastState.Impact) {
    return nextState;
  }

  return addSkillImpactVisualEvent(nextState, snapshot.skillId, normalizeVec3(snapshot.pos), now);
}

export function applyInstantHitVisualState(
  state: GameClientState,
  message: ServerMessage & { type: 'InstantHit' },
  now: number,
): GameClientState {
  return addSkillImpactVisualEvent(state, message.skillId, normalizeVec3(message.targetPos), now);
}

export function applyItemUsedVisualState(
  state: GameClientState,
  itemUse: ServerMessage & { type: 'ItemUsed' },
  now: number,
): GameClientState {
  const inventory = [...state.inventory];
  if (itemUse.newQuantity > 0) {
    inventory[itemUse.slotIndex] = { itemId: itemUse.itemId, quantity: itemUse.newQuantity };
  } else {
    inventory.splice(itemUse.slotIndex, 1);
  }

  const usageDetails = [
    itemUse.healthDelta ? `+${Math.round(itemUse.healthDelta)} HP` : null,
    itemUse.manaDelta ? `+${Math.round(itemUse.manaDelta)} MP` : null,
    itemUse.newQuantity > 0 ? `${itemUse.newQuantity} left` : 'empty',
  ].filter(Boolean).join(', ');
  const nextState = addItemUseVisualEvent({ ...state, inventory }, itemUse, now);

  return addCombatLine(nextState, {
    id: makeCombatLineId(`item-${itemUse.slotIndex}`, state.combatLog.length, now),
    text: `Used ${getItemName(itemUse.itemId)}${usageDetails ? ` (${usageDetails})` : ''}`,
  });
}

const TELEGRAPH_FADE_MS = 600;

export function pruneClientVisualState(state: GameClientState, now: number): GameClientState {
  const telegraphs = state.bossTelegraphs.filter((t) => now - t.impactAt < TELEGRAPH_FADE_MS);
  return {
    ...state,
    casts: pruneCasts(state.casts, now),
    visualEvents: pruneVisualEvents(state.visualEvents, now),
    bossTelegraphs: telegraphs.length === state.bossTelegraphs.length ? state.bossTelegraphs : telegraphs,
  };
}

function addCastSnapshot(
  state: GameClientState,
  snapshot: CastSnapshot,
  now: number,
): GameClientState {
  const casts = {
    ...state.casts,
    [snapshot.castId]: { snapshot, seenAt: now },
  };

  return { ...state, casts };
}

function addSkillImpactVisualEvent(
  state: GameClientState,
  skillId: string,
  position: Vec3,
  now: number,
): GameClientState {
  if (skillId === 'waterSplash') {
    return addVisualEvent(state, {
      kind: 'splash',
      position,
      radius: getSkillImpactRadius(skillId),
      createdAt: now,
    });
  }

  if (skillId === 'petrify') {
    return addVisualEvent(state, { kind: 'petrify', position, createdAt: now });
  }

  return state;
}

function addItemUseVisualEvent(
  state: GameClientState,
  itemUse: ServerMessage & { type: 'ItemUsed' },
  now: number,
): GameClientState {
  const player = state.myPlayerId ? state.players[state.myPlayerId] : null;
  if (!player) {
    return state;
  }

  let nextState = state;
  if (itemUse.healthDelta && itemUse.healthDelta > 0) {
    nextState = addVisualEvent(nextState, {
      kind: 'healing',
      position: player.position,
      amount: itemUse.healthDelta,
      createdAt: now,
    });
  }

  if (itemUse.manaDelta && itemUse.manaDelta > 0) {
    nextState = addVisualEvent(nextState, {
      kind: 'mana',
      position: player.position,
      amount: itemUse.manaDelta,
      createdAt: now,
    });
  }

  return nextState;
}

function addCombatLine(state: GameClientState, line: CombatLine): GameClientState {
  return { ...state, combatLog: [line, ...state.combatLog].slice(0, MAX_COMBAT_LINES) };
}

export function formatCombatLogLine(
  state: GameClientState,
  skillId: string,
  targetIds: string[],
  damages: number[],
  crits?: boolean[],
): string {
  const firstTarget = state.enemies[targetIds[0]]?.name ?? state.players[targetIds[0]]?.name;
  const totalDamage = damages.reduce((sum, damage) => sum + damage, 0);
  const targetText = firstTarget ? ` ${firstTarget}` : ` ${targetIds.length} target(s)`;
  // §49/M2 — append "(crit!)" when any hit in this CombatLog was a
  // crit. Aggregate behavior so an AOE doesn't print 'crit' three
  // times — one suffix is enough to tell the player something
  // bigger happened.
  const critSuffix = crits?.some(Boolean) ? ' (crit!)' : '';
  return `${getSkillName(skillId)} hit${targetText} for ${Math.round(totalDamage)} damage${critSuffix}`;
}

function formatEnemyAttackLine(
  state: GameClientState,
  enemyId: string,
  targetId: string,
  damage: number,
): string {
  const enemyName = state.enemies[enemyId]?.name ?? 'Enemy';
  const playerName = state.players[targetId]?.name ?? 'player';
  return `${enemyName} hit ${playerName} for ${Math.round(damage)} damage`;
}

function formatItemDrops(items: ItemDrop[]): string {
  return items.map((item) => `${item.quantity}x ${getItemName(item.itemId)}`).join(', ');
}

function getItemName(itemId: string): string {
  return ITEMS[itemId]?.name ?? itemId;
}

function getSkillImpactRadius(skillId: string): number {
  const skill = getSkillDef(skillId);
  return skill?.projectile?.splashRadius ?? skill?.area ?? 1.4;
}

function getSkillName(skillId: string): string {
  return getSkillDef(skillId)?.name ?? skillId;
}

function getSkillDef(skillId: string): (typeof SKILLS)[keyof typeof SKILLS] | null {
  const skill = Object.prototype.hasOwnProperty.call(SKILLS, skillId)
    ? SKILLS[skillId as keyof typeof SKILLS]
    : null;
  return skill;
}

function makeCombatLineId(castId: string, currentLineCount: number, now: number): string {
  return `${castId}:${now}:${currentLineCount}`;
}

function pruneCasts(casts: GameClientState['casts'], now: number): GameClientState['casts'] {
  return Object.fromEntries(
    Object.entries(casts).filter(([, cast]) => now - cast.seenAt < CAST_VISIBLE_MS),
  );
}
