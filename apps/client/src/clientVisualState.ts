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
    text: formatCombatLogLine(state, {
      skillId: message.skillId,
      targets: message.targets,
      damages: message.damages,
      crits: message.crits,
      misses: message.misses,
      heals: message.heals,
    }),
  });
}

/**
 * §52 #1 follow-up — the legacy `CastFail` server message has been
 * retired. Cast-side failures arrive on `CommandRejected` with
 * `commandType: 'CastReq'` and the same `reason` strings the old
 * payload carried (cooldown / nomana / invalid / outofrange / …).
 *
 * §52 polish — copy made user-friendly so a player sees "out of
 * range" / "not enough mana" instead of a raw enum string in their
 * combat log. Unknown reasons fall through to the raw string so a
 * server-side reason added without client copy still surfaces.
 */
export function applyCastRejected(
  state: GameClientState,
  message: ServerMessage & { type: 'CommandRejected' },
  now: number,
): GameClientState {
  const text = castFailCopy(message.reason);
  return addCombatLine(
    state,
    { id: makeCombatLineId(`fail-${message.requestId ?? 'n'}-${message.reason}`, state.combatLog.length, now), text },
  );
}

function castFailCopy(reason: string): string {
  switch (reason) {
    case 'cooldown': return 'Cast failed: still on cooldown.';
    case 'nomana': return 'Cast failed: not enough mana.';
    case 'outofrange': return 'Cast failed: target out of range.';
    case 'invalid': return 'Cast failed: invalid target.';
    case 'missingTarget': return 'Cast failed: pick a target first.';
    case 'targetNotFound': return 'Cast failed: target is gone.';
    default: return `Cast failed: ${reason}`;
  }
}

/**
 * §52 polish — surface CommandRejecteds from inventory / vendor /
 * craft / item-use / drop / destroy / GM commands in the combat
 * log. Pre-§52 these silently dropped on the client, so a vendor
 * "not enough gold" or a craft "missing reagents" looked like the
 * button was broken. Each commandType + reason pair gets friendly
 * copy via `inventoryActionFailCopy`; unknown pairs fall through
 * to the raw text so future server reasons still surface.
 */
export const INVENTORY_VERB_COMMANDS: ReadonlySet<string> = new Set([
  'BuyFromVendor', 'SellToVendor',
  'UseItem', 'DropItem', 'DestroyItem', 'CraftItem',
  'LootPickup',
]);

export function applyInventoryRejectedVisualState(
  state: GameClientState,
  message: ServerMessage & { type: 'CommandRejected' },
  now: number,
): GameClientState {
  return addCombatLine(state, {
    id: makeCombatLineId(`invreject-${message.commandType}-${message.reason}-${message.requestId ?? 'n'}`, state.combatLog.length, now),
    text: inventoryActionFailCopy(message.commandType, message.reason),
  });
}

function inventoryActionFailCopy(commandType: string, reason: string): string {
  if (commandType === 'BuyFromVendor') {
    if (reason === 'notEnoughGold') return "You don't have enough gold for that.";
    if (reason === 'outOfStock') return 'The vendor is out of that item.';
    if (reason === 'inventoryFull') return 'Your bag is full.';
    if (reason === 'tooFarFromVendor') return 'You need to be closer to the vendor.';
    return `Vendor rejected: ${reason}`;
  }
  if (commandType === 'SellToVendor') {
    if (reason === 'itemNotFound') return "You don't have that item to sell.";
    if (reason === 'notSellable') return "The vendor won't take that.";
    if (reason === 'tooFarFromVendor') return 'You need to be closer to the vendor.';
    return `Vendor rejected: ${reason}`;
  }
  if (commandType === 'CraftItem') {
    if (reason === 'missingReagents') return 'Missing reagents for that recipe.';
    if (reason === 'inventoryFull') return 'Your bag is too full to craft.';
    if (reason === 'unknownRecipe') return "You don't know that recipe.";
    return `Craft failed: ${reason}`;
  }
  if (commandType === 'UseItem') {
    if (reason === 'itemNotFound') return "That item isn't in your bag anymore.";
    if (reason === 'onCooldown') return 'That item is on cooldown.';
    if (reason === 'notUsable') return "That item can't be used directly.";
    return `Use failed: ${reason}`;
  }
  if (commandType === 'DropItem') {
    if (reason === 'itemNotFound') return "That item isn't in your bag.";
    if (reason === 'invalidCount') return 'Invalid drop amount.';
    return `Drop failed: ${reason}`;
  }
  if (commandType === 'DestroyItem') {
    if (reason === 'itemNotFound') return "That item isn't in your bag.";
    return `Destroy failed: ${reason}`;
  }
  if (commandType === 'LootPickup') {
    if (reason === 'inventoryFull') return 'Your bag is full — make room before picking up.';
    if (reason === 'tooFar') return 'Walk closer to the loot to pick it up.';
    if (reason === 'lootNotFound') return 'That loot is already gone.';
    return `Pickup failed: ${reason}`;
  }
  return `${commandType} failed: ${reason}`;
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
 * §52 playtest follow-up — quest-verb CommandRejected commandTypes
 * the client surfaces in the combat log. Other CommandRejected
 * types have their own UI hooks (vendor toasts, equip-failed line,
 * etc.) so we don't double-report.
 */
export const QUEST_VERB_COMMANDS: ReadonlySet<string> = new Set([
  'AcceptQuest', 'CancelQuest', 'AdvanceQuest', 'ClaimQuestReward',
]);

/**
 * §52 playtest follow-up — append a combat-log line when a quest
 * verb (Claim / Next / Cancel) was rejected. Pre-this PR these
 * silently failed when the player wasn't near the giver / hadn't
 * finished the stage, and the user thought the button was broken.
 */
export function applyQuestRejectedVisualState(
  state: GameClientState,
  message: ServerMessage & { type: 'CommandRejected' },
  now: number,
): GameClientState {
  return addCombatLine(state, {
    id: makeCombatLineId(`questreject-${message.commandType}-${message.reason}`, state.combatLog.length, now),
    text: questRejectCopy(message.commandType, message.reason),
  });
}

function questRejectCopy(commandType: string, reason: string): string {
  if (commandType === 'ClaimQuestReward') {
    if (reason === 'notNearNpc') return "Walk back to the quest giver to claim the reward.";
    if (reason === 'notReady') return "That quest isn't ready to turn in yet.";
    if (reason === 'notActive') return "That quest isn't active.";
  }
  if (commandType === 'AdvanceQuest' && reason === 'noEffect') {
    return "The objective isn't complete yet.";
  }
  if (commandType === 'CancelQuest' && reason === 'noEffect') {
    return "Couldn't cancel that quest.";
  }
  if (commandType === 'AcceptQuest' && reason === 'noEffect') {
    return "Couldn't accept that quest right now.";
  }
  return `Quest action failed: ${commandType} (${reason}).`;
}

/**
 * §49/M2 + §52 #1 — surface equip/unequip failures in the combat
 * log so the player sees why a drop-into-slot did nothing. Reason
 * is a stable enum-ish string from the server; we map the common
 * ones to player-friendly copy and fall back to the raw reason.
 *
 * Pre-§52 #1 this read the legacy `EquipFailed` message; that
 * message has been retired and the payload now arrives via the
 * structured `CommandRejected` envelope with
 * `commandType ∈ {'EquipItem', 'UnequipItem'}`.
 */
export const EQUIP_VERB_COMMANDS: ReadonlySet<string> = new Set(['EquipItem', 'UnequipItem']);

export function applyEquipRejected(
  state: GameClientState,
  message: ServerMessage & { type: 'CommandRejected' },
  now: number,
): GameClientState {
  return addCombatLine(state, {
    id: makeCombatLineId(`equipfail-${message.requestId ?? 'n'}-${message.reason}`, state.combatLog.length, now),
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
    case 'twoHandBlocksOffhand': return 'you can\'t hold a shield with a two-handed weapon';
    case 'uniqueAlreadyEquipped': return 'that unique item is already equipped';
    case 'inventoryFullForUnequippedItems': return 'your bag needs a free slot to hold the unequipped piece';
    case 'notOwned': return 'that item is not yours';
    case 'itemLocked': return 'that item is locked (already equipped or in flight)';
    default: return reason;
  }
}

/**
 * §49/M2 — combat-log line announcing a boss signature cast. The
 * ground-ring VFX is already rendered (BossTelegraphRing); this
 * is the text channel so a player whose camera's panned off the
 * boss, or whose view is buried under particle FX, still sees
 * the wind-up.
 */
export function applyBossTelegraphFeedback(
  state: GameClientState,
  message: ServerMessage & { type: 'BossTelegraph' },
  now: number,
): GameClientState {
  return addCombatLine(state, {
    id: makeCombatLineId(`boss-telegraph-${message.enemyId}-${message.impactAt}`, state.combatLog.length, now),
    text: `${message.bossName} channels ${message.abilityName}!`,
  });
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
  // §52 polish — collapse consecutive duplicates so spamming a
  // skill on cooldown reads as one line with "(×N)" instead of N
  // identical lines. Match on `text` only; the id is per-emit so
  // it would never collide on its own.
  const top = state.combatLog[0];
  if (top && top.text === line.text) {
    const merged: CombatLine = { ...top, count: (top.count ?? 1) + 1 };
    return { ...state, combatLog: [merged, ...state.combatLog.slice(1)] };
  }
  return { ...state, combatLog: [line, ...state.combatLog].slice(0, MAX_COMBAT_LINES) };
}

/**
 * §49/M2 — death-event combat log line. Detected client-side via
 * `isAlive` transition (true → false) on the next entity snapshot,
 * so it works for any cause of death: skill impact, enemy attack,
 * environmental damage, falling, etc.
 *
 * `prevIsAlive` is the snapshot before the merge in the reducer;
 * `nextIsAlive` is the merged-incoming value. Only fires when the
 * flag flips alive → dead. Dead-to-dead stays silent (matters for
 * cleanup updates that re-broadcast a corpse), and dead-to-alive
 * (respawn) stays silent — there is no "defeated" event to log.
 */
export function applyEnemyDeathFeedback(
  state: GameClientState,
  enemyId: string,
  enemyName: string | undefined,
  prevIsAlive: boolean,
  nextIsAlive: boolean,
  now: number,
): GameClientState {
  if (!(prevIsAlive && !nextIsAlive)) return state;
  const label = enemyName?.trim() ? enemyName : 'Enemy';
  return addCombatLine(state, {
    id: makeCombatLineId(`death-enemy-${enemyId}`, state.combatLog.length, now),
    text: `${label} has fallen.`,
  });
}

/**
 * Sibling of `applyEnemyDeathFeedback` for players. Renders as
 * "Player X was defeated." for any tracked player flipping alive
 * → dead — including the owning client themselves; the death
 * pop-up handles UX separately, but the combat log keeps a
 * historical record of every defeat in range.
 */
export function applyPlayerDeathFeedback(
  state: GameClientState,
  playerId: string,
  playerName: string | undefined,
  prevIsAlive: boolean,
  nextIsAlive: boolean,
  now: number,
): GameClientState {
  if (!(prevIsAlive && !nextIsAlive)) return state;
  const label = playerName?.trim() ? playerName : 'A player';
  return addCombatLine(state, {
    id: makeCombatLineId(`death-player-${playerId}`, state.combatLog.length, now),
    text: `${label} was defeated.`,
  });
}

/**
 * Skill-learn success feedback for the local player. Server emits
 * `SkillLearned` after the learn request lands; the SkillTreePanel
 * gets the new skill row visually, but the combat log was silent.
 * Adding a "You learned X." line so the player has a scroll-back
 * record (and a clear delineation between server confirmation and
 * a passive panel refresh).
 *
 * SkillLearned is owner-only (see `OWNER_ONLY_SERVER_MESSAGE_TYPES`)
 * so it always targets the local player; no playerId guard needed.
 */
export function applySkillLearnedFeedback(
  state: GameClientState,
  skillId: string,
  now: number,
): GameClientState {
  const skill = getSkillDef(skillId);
  const label = skill?.name ?? skillId;
  return addCombatLine(state, {
    id: makeCombatLineId(`learn-${skillId}`, state.combatLog.length, now),
    text: `You learned ${label}.`,
  });
}

/**
 * Respawn feedback: dead → alive transition for any tracked player.
 * Renders as "You're back!" for the local player and "X respawned."
 * for others. Symmetric with `applyPlayerDeathFeedback`; only the
 * transition matters, so a snapshot resync re-asserting alive=true
 * is silent.
 */
export function applyPlayerRespawnFeedback(
  state: GameClientState,
  playerId: string,
  playerName: string | undefined,
  prevIsAlive: boolean,
  nextIsAlive: boolean,
  now: number,
): GameClientState {
  if (!(prevIsAlive === false && nextIsAlive === true)) return state;
  const text = playerId === state.myPlayerId
    ? "You're back."
    : `${playerName?.trim() ? playerName : 'A player'} respawned.`;
  return addCombatLine(state, {
    id: makeCombatLineId(`respawn-${playerId}`, state.combatLog.length, now),
    text,
  });
}

/**
 * Level-up feedback for the local player. Server emits `playerUpdated`
 * with the new `level` after `awardPlayerXP` carries the player past
 * `experienceToNextLevel`. The HUD has the bar; the combat log needs
 * a discrete row so the player has a textual record (and so a
 * mid-fight level up isn't drowned by damage numbers).
 *
 * Only emits for the local player — other-player level-ups are not
 * news to me. Only fires on a strict increase, so a snapshot resync
 * that re-asserts the same level is silent.
 */
export function applyPlayerLevelUpFeedback(
  state: GameClientState,
  playerId: string,
  prevLevel: number | undefined,
  nextLevel: number | undefined,
  now: number,
): GameClientState {
  if (playerId !== state.myPlayerId) return state;
  if (nextLevel === undefined || prevLevel === undefined) return state;
  if (nextLevel <= prevLevel) return state;
  return addCombatLine(state, {
    id: makeCombatLineId(`level-up-${nextLevel}`, state.combatLog.length, now),
    text: `You reached level ${nextLevel}!`,
  });
}

export type CombatLogLineParts = {
  skillId: string;
  targets: string[];
  damages: number[];
  crits?: boolean[];
  misses?: boolean[];
  heals?: number[];
};

export function formatCombatLogLine(state: GameClientState, parts: CombatLogLineParts): string {
  const { skillId, targets: targetIds, damages, crits, misses, heals } = parts;
  const skillName = getSkillName(skillId);
  const firstTarget = state.enemies[targetIds[0]]?.name ?? state.players[targetIds[0]]?.name;
  const targetText = firstTarget ? ` ${firstTarget}` : ` ${targetIds.length} target(s)`;
  // §52 #6 — every target dodged. Surface the miss directly instead
  // of saying "hit for 0 damage" which used to print as a no-op
  // line when invuln/shield ate the hit.
  const allMissed = !!misses && misses.length > 0 && misses.every(Boolean);
  if (allMissed) {
    return `${skillName} missed${targetText}`;
  }
  const totalDamage = damages.reduce((sum, damage) => sum + damage, 0);
  const totalHeal = heals?.reduce((sum, h) => sum + h, 0) ?? 0;
  // §52 #6 — pure heal: no damage in the message, at least one
  // positive heal. Render "X heals Y for N" so cardinal-style
  // restores don't look like a 0-damage hit.
  if (totalDamage <= 0 && totalHeal > 0) {
    return `${skillName} healed${targetText} for ${Math.round(totalHeal)}`;
  }
  // §49/M2 — append "(crit!)" when any hit in this CombatLog was a
  // crit. Aggregate behavior so an AOE doesn't print 'crit' three
  // times — one suffix is enough to tell the player something
  // bigger happened.
  const critSuffix = crits?.some(Boolean) ? ' (crit!)' : '';
  // §52 #6 — AOE with partial dodges: keep the hit line but tell
  // the player some targets got away.
  const missedCount = misses?.filter(Boolean).length ?? 0;
  const missSuffix = missedCount > 0 ? ` (${missedCount} dodged)` : '';
  // §52 #6 — mixed-effect skill (rare; e.g. a vampiric strike that
  // damages an enemy AND heals the caster on the same cast).
  const healSuffix = totalHeal > 0 ? ` (+${Math.round(totalHeal)} healed)` : '';
  return `${skillName} hit${targetText} for ${Math.round(totalDamage)} damage${critSuffix}${missSuffix}${healSuffix}`;
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
