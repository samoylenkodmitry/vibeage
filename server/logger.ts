// Runtime logging stays quiet by default. Enable gameplay debug logs with
// VIBEAGE_DEBUG_LOGS=1 and narrow them with VIBEAGE_DEBUG_CATEGORIES=skill,combat.
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const DEBUG = TRUE_VALUES.has((process.env.VIBEAGE_DEBUG_LOGS ?? '').toLowerCase());

// Define different log categories
export const LOG_CATEGORIES = {
  COLLISION: 'collision',
  PROJECTILE: 'projectile',
  MOVEMENT: 'movement',
  DAMAGE: 'damage',
  MANA: 'mana',
  HEALING: 'healing',
  ENEMY: 'enemy',
  PLAYER: 'player',
  COMBAT: 'combat',
  LOOT: 'loot',
  SKILL: 'skill',
  NETWORK: 'network',
  SYSTEM: 'system'
} as const;

export type LogCategory = typeof LOG_CATEGORIES[keyof typeof LOG_CATEGORIES];

const DEFAULT_ENABLED_CATEGORIES: LogCategory[] = [
  LOG_CATEGORIES.DAMAGE,
  LOG_CATEGORIES.ENEMY,
  LOG_CATEGORIES.PLAYER,
  LOG_CATEGORIES.COMBAT,
  LOG_CATEGORIES.LOOT,
  LOG_CATEGORIES.SKILL,
  LOG_CATEGORIES.NETWORK,
  LOG_CATEGORIES.SYSTEM
];

const configuredCategories = (process.env.VIBEAGE_DEBUG_CATEGORIES ?? '')
  .split(',')
  .map((category) => category.trim())
  .filter(Boolean);
const ENABLED_CATEGORIES = new Set(configuredCategories.length > 0
  ? configuredCategories
  : DEFAULT_ENABLED_CATEGORIES);

/**
 * Logs a message if debugging is enabled and the category is enabled
 * @param category The log category
 * @param message The message to log
 * @param args Optional additional args to log
 */
export function debug(category: LogCategory, message: string, ...args: unknown[]) {
  if (DEBUG && ENABLED_CATEGORIES.has(category)) {
    console.log(`[${category.toUpperCase()}] ${message}`, ...args);
  }
}

export const log = debug;

/**
 * Logs a warning message
 * @param category The log category
 * @param message The message to log
 * @param args Optional additional args to log
 */
export function warn(category: LogCategory, message: string, ...args: unknown[]) {
  console.warn(`[${category.toUpperCase()}] WARNING: ${message}`, ...args);
}

/**
 * Logs an error message
 * @param category The log category
 * @param message The message to log
 * @param args Optional additional args to log
 */
export function error(category: LogCategory, message: string, ...args: unknown[]) {
  console.error(`[${category.toUpperCase()}] ERROR: ${message}`, ...args);
}
