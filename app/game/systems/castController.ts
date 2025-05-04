'use client';

import { useGameStore } from './gameStore';
import { SkillId } from '../../../shared/skillsDefinition';
import { VecXZ } from '../../../shared/messages';

/**
 * Tries to start casting a skill. This is a unified entry point for skill casting
 * that replaces the legacy path via CastStart messages.
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
  
  // Use the existing sendCastReq implementation
  useGameStore.getState().sendCastReq(skillId, selectedTargetId || undefined, targetPos);
  
  // Set this as the selected skill for UI state
  useGameStore.getState().setSelectedSkill(skillId);
}
