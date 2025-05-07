// filepath: /home/s/develop/projects/vibe/1/server/logger.ts
// Simple logger module to replace console.log with more controlled debugging

// Set to true to enable debug logs, false to disable them
export const DEBUG = true;

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
  SKILL: 'skill',
  NETWORK: 'network',
  SYSTEM: 'system'
};

// Set which categories to enable when DEBUG is true
const ENABLED_CATEGORIES = [
  //LOG_CATEGORIES.COLLISION,
  // LOG_CATEGORIES.PROJECTILE, // Disabled to reduce log spam
  LOG_CATEGORIES.DAMAGE,
  LOG_CATEGORIES.ENEMY,
  LOG_CATEGORIES.PLAYER,
  LOG_CATEGORIES.SKILL,
  LOG_CATEGORIES.NETWORK,
  LOG_CATEGORIES.SYSTEM
];

/**
 * Logs a message if debugging is enabled and the category is enabled
 * @param category The log category
 * @param message The message to log
 * @param args Optional additional args to log
 */
export function log(category: string, message: string, ...args: any[]) {
  if (DEBUG && ENABLED_CATEGORIES.includes(category)) {
    console.log(`[${category.toUpperCase()}] ${message}`, ...args);
  }
}

/**
 * Logs a warning message
 * @param category The log category
 * @param message The message to log
 * @param args Optional additional args to log
 */
export function warn(category: string, message: string, ...args: any[]) {
  console.warn(`[${category.toUpperCase()}] WARNING: ${message}`, ...args);
}

/**
 * Logs an error message
 * @param category The log category
 * @param message The message to log
 * @param args Optional additional args to log
 */
export function error(category: string, message: string, ...args: any[]) {
  console.error(`[${category.toUpperCase()}] ERROR: ${message}`, ...args);
}
