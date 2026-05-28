export type GameActionId = 'attack' | 'move' | 'pickup' | 'escape';

export interface GameActionSpec {
  id: GameActionId;
  label: string;
  hotkey: string;
  icon: string;
  description: string;
}

export const GAME_ACTION_ICON_SLUGS: Record<GameActionId, string> = {
  attack: 'attack',
  move: 'move',
  pickup: 'pickup',
  escape: 'escape',
};

export function gameActionIconPath(actionId: GameActionId): string {
  return `/game/actions/action-icon-${GAME_ACTION_ICON_SLUGS[actionId]}.png`;
}

function defineGameAction(action: Omit<GameActionSpec, 'icon'>): GameActionSpec {
  return { ...action, icon: gameActionIconPath(action.id) };
}

export const GAME_ACTIONS: Record<GameActionId, GameActionSpec> = {
  attack: defineGameAction({
    id: 'attack',
    label: 'Attack',
    hotkey: 'A',
    description: 'Strike the selected hostile target with the basic attack.',
  }),
  move: defineGameAction({
    id: 'move',
    label: 'Move',
    hotkey: 'M',
    description: 'Walk to the selected target or active navigation marker.',
  }),
  pickup: defineGameAction({
    id: 'pickup',
    label: 'Pickup',
    hotkey: 'F',
    description: 'Walk to the nearest visible ground loot and collect it.',
  }),
  escape: defineGameAction({
    id: 'escape',
    label: 'Escape',
    hotkey: 'Z',
    description: 'Channel a recall back to the nearest safe waypoint.',
  }),
};

export function getGameActionSpec(actionId: string): GameActionSpec | undefined {
  return GAME_ACTIONS[actionId as GameActionId];
}
