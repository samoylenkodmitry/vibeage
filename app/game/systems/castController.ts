'use client';

import { useGameStore } from './gameStore';
import { SkillId } from '../../../shared/skillsDefinition';
import { VecXZ } from '../../../shared/messages';

/**
 * Tries to start casting a skill. This is a unified entry point for skill casting
 * that delegates to the server for validation and execution.
 * 
 * This function is completely server-authoritative and does not perform any client-side
 * validation or state changes. The server will determine:
 * - If the player has enough mana
 * - If the skill is off cooldown
 * - If the target is valid and in range
 * - Apply all costs, cooldowns and effects
 * 
 * The client will receive updates via CastSnapshot, EffectSnapshot, and CombatLog messages
 * 
 * @param skillId The ID of the skill to cast
 * @param targetId Optional ID of the target entity
 * @param targetPos Optional position to target the skill at
 */
export function tryStartCast(skillId: SkillId, targetId?: string, targetPos?: VecXZ) {
  // Get the selected target from the game store if not explicitly provided
  const selectedTargetId = targetId || useGameStore.getState().selectedTargetId;
  
  console.log(`Attempting to cast skill: ${skillId}`, {
    targetId: selectedTargetId,
    targetPos
  });
  
  // Send the cast request to the server via socket
  useGameStore.getState().sendCastReq(skillId, selectedTargetId || undefined, targetPos);
  
  // Set this as the selected skill for UI state
  useGameStore.getState().setSelectedSkill(skillId);
}
